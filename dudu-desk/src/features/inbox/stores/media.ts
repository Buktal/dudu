import { mediaKey } from "./media-reducers";
import { requestKeys, runOperation } from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

/**
 * 消息媒体字节的按需读取：只有渠道标识、没有公开链接的素材经媒体接口以已有认证请求取
 * Blob，成功后生成本地对象 URL 供展示/打开；公开链接由界面直连渠道，不经过存储层。
 * 在途或已就绪的「消息:下标」不重复请求；失败保留 error 状态，由界面提供重试入口。
 */
export function loadMessageMedia(
  messageId: string,
  index: number,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const key = mediaKey(messageId, index);
    // 在途或已就绪不重复请求；error 允许界面重试再发起
    const existing = getState().inbox.media[key];
    if (existing && existing.status !== "error") return;
    await runOperation(
      runtime,
      requestKeys.media(messageId, index),
      getState,
      async (op) => {
        dispatch(inboxActions.mediaRequested(key));
        try {
          const blob = await runtime.api.loadMessageMedia({
            messageId,
            index,
            context: op.context,
            signal: op.signal,
          });
          if (!op.current()) return;
          const url = URL.createObjectURL(blob);
          runtime.previews.set(key, url);
          op.settle(() => dispatch(inboxActions.mediaReady({ key, url })));
        } catch {
          // 失败原因不进入界面文案：界面沿用现有失败提示，读取状态只保留 error
          op.settle(() => dispatch(inboxActions.mediaFailed(key)));
        }
      },
    );
  };
}
