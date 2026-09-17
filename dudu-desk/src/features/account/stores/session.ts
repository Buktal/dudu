import { type ApiFailure, failureOf } from "@/lib/api-response";
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
      const username = credentials.username.trim();
      if (!username || !credentials.password) {
        scope.abort();
        publish({
          status: "signed-out",
          session: null,
          error: { kind: "business", message: "请输入账号和密码" },
        });
        return false;
      }
      const pending = begin({ status: "signing-in", session: null });
      try {
        const session = await api.signIn(
          { username, password: credentials.password },
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
