import type { LoginResult, Profile } from "./types";
import { isProfile, isRecord } from "./validators";

const SESSION_KEY = "dudu-console.session";
const REQUEST_TIMEOUT_MS = 20_000;
// 企业管理员身份恢复与权限刷新共用同一接口。
export const PROFILE_PATH = "/console/profile";
export const COMPANY_ID_CONFLICT = 12300;
const EXPIRED_CODES = new Set([10100, 10101, 10102, 10103]);

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
  origin: string;
  profile: Profile | null;
  restoring: boolean;
  generation: number;
  accessRevision: number;
  notice: string | null;
}

export class ConsoleClient {
  private token: string | null = null;
  private listeners = new Set<() => void>();
  private pending = new Set<AbortController>();
  private state: ClientState;
  constructor() {
    const origin = "";
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
      origin,
      profile: null,
      restoring: !!this.token,
      generation: 0,
      accessRevision: 0,
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
      profile: null,
      restoring: false,
      generation: this.state.generation + 1,
      notice,
    });
  }

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
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
    const writing =
      options.method !== undefined &&
      options.method !== "GET" &&
      !path.endsWith("/query");
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
        if (
          token &&
          (EXPIRED_CODES.has(envelope.code) ||
            (envelope.code === 10106 && path === PROFILE_PATH))
        )
          this.clearSession("登录已失效，请重新登录");
        if (token && envelope.code === 10106 && path !== PROFILE_PATH)
          void this.refreshProfile(writing);
        // 失效写入后重查列表和详情；读取本身失败不触发重查，避免循环。
        if (token && writing && envelope.code === 12100)
          this.publish({ accessRevision: this.state.accessRevision + 1 });
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

  async login(
    companyId: string,
    username: string,
    password: string,
    signal?: AbortSignal,
  ) {
    const generation = this.state.generation;
    const result = await this.request("/console/login", {
      method: "POST",
      body: { companyId, username, password },
      anonymous: true,
      signal,
      validate: (data): data is LoginResult =>
        isRecord(data) &&
        typeof data.token === "string" &&
        !!data.token &&
        Number.isSafeInteger(data.expiresAt) &&
        Number(data.expiresAt) > Date.now() / 1000 &&
        isProfile(data.profile),
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
    this.publish({ profile: result.profile, restoring: false, notice: null });
  }

  async restore(signal: AbortSignal) {
    if (!this.token) return;
    try {
      const profile = await this.request(PROFILE_PATH, {
        signal,
        validate: isProfile,
      });
      if (!signal.aborted) this.publish({ profile, restoring: false });
    } catch (error) {
      if (!isCancelled(error)) this.clearSession(errorMessage(error));
    }
  }

  async refreshProfile(refreshQueries = false) {
    try {
      const profile = await this.request(PROFILE_PATH, { validate: isProfile });
      this.publish({
        profile,
        accessRevision:
          this.state.accessRevision +
          (!refreshQueries &&
          JSON.stringify(profile) === JSON.stringify(this.state.profile)
            ? 0
            : 1),
      });
    } catch {
      /* 请求层处理身份失效，其余错误由原业务操作呈现。 */
    }
  }

  async logout() {
    try {
      await this.request("/console/logout", {
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

export { isRecord } from "./validators";
export const isEmpty = (data: unknown): data is null => data === null;
