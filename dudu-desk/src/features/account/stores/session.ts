import { type ApiFailure, DeskApiError, failureOf } from "@/lib/api-response";
import { createRequestScope } from "@/lib/request-scope";
import type { AccountApi, AgentSession, LoginCredentials } from "../api";

type AccountStatus =
  | "loading"
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "signing-out";
export type AccountSnapshot = Readonly<{
  status: AccountStatus;
  session: AgentSession | null;
  error?: ApiFailure;
}>;

export function createAccountSession(api: AccountApi) {
  let snapshot: AccountSnapshot = { status: "loading", session: null };
  // Abort-previous + currency lives in the shared scope (see
  // src/lib/request-scope.ts); the disposed flag stays local for the publish
  // guard and the entry checks below.
  const scope = createRequestScope();
  let disposed = false;
  const listeners = new Set<() => void>();
  function publish(next: AccountSnapshot) {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  function begin(next: AccountSnapshot) {
    const signal = scope.begin();
    publish(next);
    return signal;
  }
  function current(requested: AbortSignal) {
    return !disposed && scope.isCurrent(requested);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore: async () => {
      if (disposed || snapshot.session) return;
      const pending = begin({ status: "loading", session: null });
      try {
        const session = await api.getSession(pending);
        if (current(pending))
          publish({ status: session ? "signed-in" : "signed-out", session });
      } catch (error) {
        if (current(pending))
          publish({
            status: "signed-out",
            session: null,
            error: failureOf(error, "暂时无法完成操作，请重试"),
          });
      }
    },
    signIn: async (credentials: LoginCredentials) => {
      if (disposed || snapshot.session || snapshot.status === "signing-in")
        return false;
      const companyId = credentials.companyId.trim();
      const username = credentials.username.trim();
      if (!companyId || !username || !credentials.password) {
        scope.abort();
        publish({
          status: "signed-out",
          session: null,
          error: { kind: "business", message: "请输入企业 ID、账号和密码" },
        });
        return false;
      }
      const pending = begin({ status: "signing-in", session: null });
      try {
        const session = await api.signIn(
          { companyId, username, password: credentials.password },
          pending,
        );
        if (!current(pending)) return false;
        publish({ status: "signed-in", session });
        return true;
      } catch (error) {
        if (current(pending))
          publish({
            status: "signed-out",
            session: null,
            error: failureOf(error, "暂时无法完成操作，请重试"),
          });
        return false;
      }
    },
    /**
     * 重查身份（权限范围变化后由工作区调用）：成功后发布新会话并返回它；
     * 凭据不可用（失效 / 无权限）时退出登录；其他失败保留当前会话供重试，返回 null。
     */
    refresh: async (): Promise<AgentSession | null> => {
      if (disposed) return null;
      const currentSession = snapshot.session;
      const pending = begin(snapshot);
      try {
        const session = await api.getSession(pending);
        if (!current(pending)) return null;
        publish({ status: session ? "signed-in" : "signed-out", session });
        return session;
      } catch (error) {
        if (!current(pending)) return null;
        const unusable =
          error instanceof DeskApiError &&
          (error.kind === "authentication" || error.kind === "forbidden");
        publish(
          unusable
            ? {
                status: "signed-out",
                session: null,
                error: failureOf(error, "登录状态无效，请重新登录"),
              }
            : { status: "signed-in", session: currentSession },
        );
        return null;
      }
    },
    signOut: async () => {
      const session = snapshot.session;
      if (disposed || !session || snapshot.status === "signing-out")
        return false;
      const pending = begin({ status: "signing-out", session });
      try {
        await api.signOut(pending);
        if (!current(pending)) return false;
        publish({ status: "signed-out", session: null });
        return true;
      } catch (error) {
        if (current(pending))
          publish({
            status: "signed-in",
            session,
            error: failureOf(error, "暂时无法完成操作，请重试"),
          });
        return false;
      }
    },
    dispose: () => {
      disposed = true;
      scope.dispose();
      listeners.clear();
      snapshot = { status: "signed-out", session: null };
    },
  };
}

export type AccountSessionStore = ReturnType<typeof createAccountSession>;
