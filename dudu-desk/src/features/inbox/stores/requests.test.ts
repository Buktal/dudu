import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import {
  beginRequest,
  requestKeys,
  runConversationOperation,
} from "./requests";
import type { InboxRootState, InboxRuntime } from "./store";

/**
 * 会话域操作骨架（runConversationOperation）的不变量直钉：
 * ①尝试换代后读类操作收敛 cancelled 且不结算，写类按 failed 结算；
 * ②迟到结果不复活已移除的会话（会话不在册时不写回）；
 * ③正常路径结算成功。搭建方式对照相邻 store 测试的假 api 风格，
 * 但直接驱动骨架本身，不经过命令层。
 */

/** 骨架只触达 runtime.requests 槽位映射，其余运行时字段不参与本次断言。 */
function harness(keepConversation = true) {
  const effects: string[] = [];
  const state = {
    inbox: {
      generation: 0,
      conversations: keepConversation
        ? { "conversation-a": { id: "conversation-a" } }
        : {},
    },
  };
  const runtime = {
    requests: new Map(),
  } as unknown as InboxRuntime;
  const getState = () => state as unknown as InboxRootState;
  function run(
    kind: "history" | "send",
    call: () => Promise<unknown>,
  ): Promise<void> {
    return runConversationOperation(runtime, getState, "conversation-a", kind, {
      loading: () => {
        effects.push("loading");
      },
      call,
      cancelled: () => {
        effects.push("cancelled");
      },
      loaded: (result) => {
        effects.push(`loaded:${String(result)}`);
      },
      failed: (failure) => {
        effects.push(`failed:${failure.kind}`);
      },
    });
  }
  return { effects, run, getState, runtime };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("conversation operation skeleton invariants", () => {
  it("a superseded read settles cancelled without a failure", async () => {
    const h = harness();
    const release = deferred<string>();
    const first = h.run("history", () => release.promise);
    // 同键新尝试接管槽位：上一次尝试的信号被取消（骨架的 beginRequest 惯例）
    beginRequest(h.runtime, requestKeys.history("conversation-a"), h.getState);
    release.reject(new DeskApiError("aborted", "操作已取消"));
    await first;
    // 读类取消收敛回可重入形态：不进 failed、不写回结果
    expect(h.effects).toEqual(["loading", "cancelled"]);
  });

  it("a superseded write still settles failed for its uncertain result", async () => {
    const h = harness();
    const release = deferred<string>();
    const first = h.run("send", () => release.promise);
    // 写类槽位的键拼写与读类同源（send:会话），换代语义一致
    beginRequest(h.runtime, "send:conversation-a", h.getState);
    release.reject(new DeskApiError("aborted", "操作已取消"));
    await first;
    // 写操作没有 cancelled 出口：取消按 aborted 结算 failed，
    // 否则提交停在 sending、发送锁无法释放
    expect(h.effects).toEqual(["loading", "failed:aborted"]);
  });

  it("a late success never resurrects a removed conversation", async () => {
    const h = harness();
    const release = deferred<string>();
    const pending = h.run("history", () => release.promise);
    // 结果落地前会话已被移除：不在册的会话不写回任何结果
    delete h.getState().inbox.conversations["conversation-a"];
    release.resolve("page");
    await pending;
    expect(h.effects).toEqual(["loading"]);
  });

  it("a late failure on a removed conversation stays swallowed", async () => {
    const h = harness();
    const release = deferred<string>();
    const pending = h.run("send", () => release.promise);
    delete h.getState().inbox.conversations["conversation-a"];
    release.reject(new DeskApiError("business", "渠道拒绝", 50001));
    await pending;
    // 会话已拆除：失败效果也不写回，两种迟到结果都保持吞掉
    expect(h.effects).toEqual(["loading"]);
  });

  it("a normal run validates and settles loaded", async () => {
    const h = harness();
    await h.run("history", async () => "page");
    expect(h.effects).toEqual(["loading", "loaded:page"]);
  });
});
