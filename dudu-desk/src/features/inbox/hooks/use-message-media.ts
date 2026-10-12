import { useEffect } from "react";
import { loadMessageMedia, mediaKey } from "../stores/media";
import { useInboxDispatch, useInboxSelector } from "./use-inbox-store";

export type MessageMediaState = {
  status: "idle" | "loading" | "ready" | "error";
  url: string | null;
};

/**
 * 界面按需读取媒体字节的入口：只有渠道标识、没有公开链接的素材在挂载时经媒体接口
 * 取一次字节（enabled 为 false 时不请求，公开链接由调用方直连渠道）。每「消息:下标」
 * 只请求一次，失败保留 error 状态，由界面沿用现有失败提示。
 */
export function useMessageMedia(
  messageId: string,
  index: number,
  enabled: boolean,
): MessageMediaState {
  const dispatch = useInboxDispatch();
  const entry = useInboxSelector(
    (state) => state.inbox.media[mediaKey(messageId, index)],
  );
  useEffect(() => {
    if (enabled && !entry) void dispatch(loadMessageMedia(messageId, index));
  }, [dispatch, enabled, entry, messageId, index]);
  return { status: entry?.status ?? "idle", url: entry?.url ?? null };
}
