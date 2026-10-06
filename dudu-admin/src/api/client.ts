import {
  type Environment,
  parseOrigin,
  readEnvironment,
  saveEnvironment,
} from "./environment";
import type { Account, LoginResult } from "./types";

const SESSION_KEY = "dudu-admin.session";
const REQUEST_TIMEOUT_MS = 20_000;
export const COMPANY_ID_CONFLICT = 12300;
const EXPIRED_CODES = new Set([10100, 10101, 10102, 10103, 10106]);

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isCancelled = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "请求失败，请重试";

interface ClientState {
  environment: Environment;
  localOrigin: string;
  origin: string;
  user: Account | null;
  restoring: boolean;
  generation: number;
  notice: string | null;
}

export class AdminClient {
  private token: string | null = null;
  private listeners = new Set<() => void>();
  private pending = new Set<AbortController>();
  private state: ClientState;
  readonly development: boolean;
  readonly onlineOrigin: string;

  constructor(options: { development?: boolean; onlineOrigin?: string } = {}) {
    this.development = options.development ?? import.meta.env.DEV;
    this.onlineOrigin = parseOrigin(
      options.onlineOrigin ??
        import.meta.env.VITE_API_ORIGIN ??
        "https://api.dudu.example",
    );
    const settings = readEnvironment(this.development);
    const origin =
      settings.environment === "local"
        ? settings.localOrigin
        : this.onlineOrigin;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
      if (
        saved?.origin === origin &&
        typeof saved.token === "string" &&
        saved.token
      )
        this.token = saved.token;
    } catch {
      /* 无可恢复的凭据时展示登录页。 */
    }
    this.state = {
      ...settings,
      origin,
      user: null,
      restoring: !!this.token,
      generation: 0,
      notice: null,
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  clearSession(notice: string | null = null) {
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
    this.token = null;
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* 内存凭据已清除。 */
    }
    this.publish({
      user: null,
      restoring: false,
      generation: this.state.generation + 1,
      notice,
    });
  }

  switchEnvironment(
    environment: Environment,
    localOrigin = this.state.localOrigin,
  ) {
    if (!this.development) return;
    const normalized = parseOrigin(localOrigin);
    const origin = environment === "local" ? normalized : this.onlineOrigin;
    if (origin === this.state.origin && environment === this.state.environment)
      return;
    this.clearSession();
    saveEnvironment(environment, normalized);
    this.publish({ environment, localOrigin: normalized, origin });
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT";
      body?: unknown;
      signal?: AbortSignal;
      anonymous?: boolean;
      paginated?: boolean;
      validate: (data: unknown) => data is T;
    },
  ): Promise<T> {
    const controller = new AbortController();
    const generation = this.state.generation;
    const token = options.anonymous ? null : this.token;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    this.pending.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    const assertCurrent = () => {
      if (controller.signal.aborted || generation !== this.state.generation)
        throw new DOMException("请求已取消", "AbortError");
    };
    try {
      assertCurrent();
      const response = await fetch(`${this.state.origin}/api${path}`, {
        method: options.method ?? "GET",
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        headers: {
          Accept: "application/json",
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      assertCurrent();
      if (!response.ok) {
        if (token && (response.status === 401 || response.status === 403))
          this.clearSession("登录已失效，请重新登录");
        throw new ApiError(
          response.status >= 500
            ? "服务暂时不可用，请稍后重试"
            : `请求失败（${response.status}），请重试`,
        );
      }
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new ApiError("服务响应异常，请重试");
      }
      assertCurrent();
      if (
        !isRecord(envelope) ||
        typeof envelope.code !== "number" ||
        typeof envelope.msg !== "string" ||
        (!options.paginated && !("data" in envelope))
      ) {
        throw new ApiError("服务响应异常，请重试");
      }
      if (envelope.code !== 0) {
        if (token && EXPIRED_CODES.has(envelope.code))
          this.clearSession("登录已失效，请重新登录");
        throw new ApiError(envelope.msg || "操作失败，请重试", envelope.code);
      }
      const data = options.paginated ? envelope : envelope.data;
      if (!options.validate(data)) throw new ApiError("服务响应异常，请重试");
      return data;
    } catch (error) {
      if (
        generation !== this.state.generation ||
        (controller.signal.aborted && !timedOut)
      )
        throw new DOMException("请求已取消", "AbortError");
      if (timedOut) throw new ApiError("请求超时，请重试");
      if (error instanceof ApiError) throw error;
      throw new ApiError("无法连接服务，请检查网络后重试");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      this.pending.delete(controller);
    }
  }

  async login(username: string, password: string, signal?: AbortSignal) {
    const generation = this.state.generation;
    const result = await this.request("/admin/login", {
      method: "POST",
      body: { username, password },
      anonymous: true,
      signal,
      validate: (data): data is LoginResult =>
        isRecord(data) &&
        typeof data.token === "string" &&
        !!data.token &&
        typeof data.exp === "number" &&
        isAccount(data.user),
    });
    if (generation !== this.state.generation || signal?.aborted) return;
    this.token = result.token;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ origin: this.state.origin, token: this.token }),
      );
    } catch {
      /* 存储不可用时仅保持当前页面会话。 */
    }
    this.publish({ user: result.user, restoring: false, notice: null });
  }

  async restore(signal: AbortSignal) {
    if (!this.token) return;
    try {
      const user = await this.request("/admin/profile", {
        signal,
        validate: isAccount,
      });
      if (!signal.aborted) this.publish({ user, restoring: false });
    } catch (error) {
      if (!isCancelled(error)) this.clearSession(errorMessage(error));
    }
  }

  async logout() {
    try {
      await this.request("/admin/logout", {
        method: "POST",
        validate: isEmpty,
      });
      this.clearSession();
    } catch (error) {
      if (!isCancelled(error))
        this.clearSession("已退出本机登录。服务未确认退出，可稍后重新登录。");
    }
  }
}

export const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null;
export const isEmpty = (data: unknown): data is null => data === null;
export const isAccount = (data: unknown): data is Account =>
  isRecord(data) &&
  typeof data.userId === "string" &&
  typeof data.username === "string" &&
  typeof data.name === "string" &&
  data.role === "admin";
