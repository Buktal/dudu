import { describe, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import {
  type AccountApi,
  type AgentSession,
  unavailableAccountApi,
} from "../api";
import { createAccountSession } from "./session";

const session: AgentSession = {
  agent: {
    id: "agent-1",
    name: "坐席一",
    username: "agent.one",
    roleName: "客服坐席",
  },
  workspace: { id: "workspace-1", name: "工作台一" },
};

function accountApi(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    getSession: async () => session,
    signIn: async () => session,
    signOut: async () => {},
    ...overrides,
  };
}

describe("account session lifecycle", () => {
  it("restores account metadata and removes it only after a successful sign out", async () => {
    const signOut = vi.fn(async () => {});
    const store = createAccountSession(accountApi({ signOut }));
    const states: string[] = [];
    store.subscribe(() => states.push(store.getSnapshot().status));
    await store.restore();
    expect(store.getSnapshot().session).toEqual(session);
    expect(await store.signOut()).toBe(true);
    expect(store.getSnapshot()).toEqual({
      status: "signed-out",
      session: null,
    });
    expect(states).toEqual([
      "loading",
      "signed-in",
      "signing-out",
      "signed-out",
    ]);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("normalizes the account name while forwarding the password exactly and never publishing it", async () => {
    const signIn = vi.fn(async () => session);
    const store = createAccountSession(
      accountApi({ getSession: async () => null, signIn }),
    );
    await store.restore();
    await store.signIn({
      username: " agent.one ",
      password: "  private password  ",
    });
    expect(signIn).toHaveBeenCalledWith(
      { username: "agent.one", password: "  private password  " },
      expect.any(AbortSignal),
    );
    expect(store.getSnapshot()).toEqual({ status: "signed-in", session });
    expect(JSON.stringify(store.getSnapshot())).not.toContain(
      "private password",
    );
  });

  it("keeps failed authentication signed out and allows another attempt", async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(
        new DeskApiError("authentication", "账号或密码不正确"),
      )
      .mockResolvedValueOnce(session);
    const store = createAccountSession(accountApi({ signIn }));
    expect(
      await store.signIn({ username: "agent.one", password: "wrong" }),
    ).toBe(false);
    expect(store.getSnapshot()).toMatchObject({
      status: "signed-out",
      session: null,
      error: { kind: "authentication" },
    });
    expect(
      await store.signIn({ username: "agent.one", password: "correct" }),
    ).toBe(true);
    expect(store.getSnapshot().error).toBeUndefined();
  });

  it("keeps the current account when sign out fails and allows a retry", async () => {
    const signOut = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const store = createAccountSession(accountApi({ signOut }));
    await store.restore();
    expect(await store.signOut()).toBe(false);
    expect(store.getSnapshot()).toMatchObject({
      status: "signed-in",
      session,
      error: { kind: "network" },
    });
    expect(await store.signOut()).toBe(true);
    expect(store.getSnapshot().session).toBeNull();
  });

  it("does not let a late restored identity replace a newer login", async () => {
    let finishRestore: (value: AgentSession | null) => void = () => {};
    let restoreSignal: AbortSignal | undefined;
    const old = new Promise<AgentSession | null>((resolve) => {
      finishRestore = resolve;
    });
    const newer = { ...session, agent: { ...session.agent, id: "agent-2" } };
    const store = createAccountSession(
      accountApi({
        getSession: (signal) => {
          restoreSignal = signal;
          return old;
        },
        signIn: async () => newer,
      }),
    );
    const restoring = store.restore();
    await store.signIn({ username: "agent.two", password: "secret" });
    finishRestore(session);
    await restoring;
    expect(restoreSignal?.aborted).toBe(true);
    expect(store.getSnapshot().session?.agent.id).toBe("agent-2");
  });

  it("deduplicates an in-flight sign out", async () => {
    let finish: () => void = () => {};
    const result = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const signOut = vi.fn(() => result);
    const store = createAccountSession(accountApi({ signOut }));
    await store.restore();
    const leaving = store.signOut();
    expect(await store.signOut()).toBe(false);
    expect(signOut).toHaveBeenCalledOnce();
    finish();
    expect(await leaving).toBe(true);
  });

  it("aborts pending login on disposal and ignores a response from an adapter that did not cancel", async () => {
    let finish: (value: AgentSession) => void = () => {};
    let signal: AbortSignal | undefined;
    const result = new Promise<AgentSession>((resolve) => {
      finish = resolve;
    });
    const store = createAccountSession(
      accountApi({
        signIn: (_, inputSignal) => {
          signal = inputSignal;
          return result;
        },
      }),
    );
    const changed = vi.fn();
    store.subscribe(changed);
    const signingIn = store.signIn({
      username: "agent.one",
      password: "secret",
    });
    store.dispose();
    const noticesBefore = changed.mock.calls.length;
    finish(session);
    expect(await signingIn).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(changed).toHaveBeenCalledTimes(noticesBefore);
    expect(store.getSnapshot().session).toBeNull();
  });

  it("rejects blank credentials locally and the unavailable adapter cannot create a session", async () => {
    const signIn = vi.fn();
    const store = createAccountSession(accountApi({ signIn }));
    expect(await store.signIn({ username: " ", password: "" })).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
    const production = createAccountSession(unavailableAccountApi);
    await production.restore();
    expect(
      await production.signIn({ username: "agent", password: "secret" }),
    ).toBe(false);
    expect(production.getSnapshot()).toMatchObject({
      status: "signed-out",
      session: null,
      error: { kind: "unavailable" },
    });
  });
});
