import { beforeEach, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import { loadMessageMedia, mediaKey } from "./media";
import { resetContext } from "./reading";
import { testStore } from "./test-support";

/**
 * 媒体字节按需读取：每个消息内序号只请求一次，成功经认证适配器取 Blob 后生成本地对象 URL；
 * 失败按现有失败提示语义留 error，不伪造素材；上下文重置后迟到的结果不再落库。
 */
function stubObjectUrl(value = "blob:http://localhost/media") {
  const revoke = vi.fn();
  const NativeUrl = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeUrl {
      static createObjectURL() {
        return value;
      }
      static revokeObjectURL = revoke;
    },
  );
  return revoke;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

it("loads media bytes once per message index and exposes a local blob URL", async () => {
  const revoke = stubObjectUrl("blob:http://localhost/media-9001:1");
  const loadMessageMediaApi = vi.fn(async () => new Blob(["mpeg"]));
  const store = testStore({ loadMessageMedia: loadMessageMediaApi });

  await store.dispatch(loadMessageMedia("9001", 1));

  expect(loadMessageMediaApi).toHaveBeenCalledTimes(1);
  expect(loadMessageMediaApi).toHaveBeenCalledWith(
    expect.objectContaining({ messageId: "9001", index: 1 }),
  );
  expect(store.getState().inbox.media[mediaKey("9001", 1)]).toEqual({
    status: "ready",
    url: "blob:http://localhost/media-9001:1",
  });

  // 已读取的序号不重复请求；不同序号各自读取
  await store.dispatch(loadMessageMedia("9001", 1));
  await store.dispatch(loadMessageMedia("9001", 0));
  expect(loadMessageMediaApi).toHaveBeenCalledTimes(2);
  expect(revoke).not.toHaveBeenCalled();
});

it("keeps a failed media read as an error without inventing a source", async () => {
  stubObjectUrl();
  const loadMessageMediaApi = vi.fn(async () => {
    throw new DeskApiError("business", "该消息没有这个媒体", 12100);
  });
  const store = testStore({ loadMessageMedia: loadMessageMediaApi });

  await store.dispatch(loadMessageMedia("9001", 0));

  expect(store.getState().inbox.media[mediaKey("9001", 0)]).toEqual({
    status: "error",
  });
  // 失败不重试、不生成素材地址，由界面沿用现有失败提示
  await store.dispatch(loadMessageMedia("9001", 0));
  expect(loadMessageMediaApi).toHaveBeenCalledTimes(1);
});

it("drops a late media response after the work context changed", async () => {
  const revoke = stubObjectUrl("blob:http://localhost/late");
  let settle!: (blob: Blob) => void;
  const pending = new Promise<Blob>((resolve) => {
    settle = resolve;
  });
  const store = testStore({ loadMessageMedia: () => pending });
  const loading = store.dispatch(loadMessageMedia("9001", 2));
  expect(store.getState().inbox.media[mediaKey("9001", 2)].status).toBe(
    "loading",
  );

  store.dispatch(resetContext({ agentId: "other-agent", workspaceId: "desk" }));
  settle(new Blob(["late"]));
  await loading;

  expect(store.getState().inbox.media).toEqual({});
  expect(revoke).not.toHaveBeenCalled();
});

it("releases media object URLs when the work context resets", async () => {
  const revoke = stubObjectUrl("blob:http://localhost/owned");
  const store = testStore({ loadMessageMedia: async () => new Blob(["ok"]) });
  await store.dispatch(loadMessageMedia("9001", 0));

  store.dispatch(resetContext({ agentId: "other-agent", workspaceId: "desk" }));

  expect(revoke).toHaveBeenCalledWith("blob:http://localhost/owned");
});
