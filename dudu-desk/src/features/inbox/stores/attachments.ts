import { isEqual } from "lodash-es";
import { DeskApiError } from "@/lib/api-response";
import {
  attachmentKind,
  attachmentRestriction,
  readPreparedAttachment,
} from "../attachment-rules";
import { sendTarget } from "../sending-rules";
import {
  failureOf,
  releaseAttachmentResources,
  requestKeys,
  runOperation,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export function addAttachments(
  conversationId: string,
  files: readonly File[],
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const preparations: Promise<void>[] = [];
    for (const file of files) {
      const state = getState().inbox;
      const restriction = attachmentRestriction(
        state.conversations[conversationId],
        state.connection,
        { name: file.name, size: file.size, mimeType: file.type },
        (state.drafts[conversationId]?.attachmentIds.length ?? 0) + 1,
        runtime.now(),
      );
      if (restriction) {
        dispatch(inboxActions.noticeChanged(`${file.name}：${restriction}`));
        continue;
      }
      const id = runtime.id();
      const kind = attachmentKind(file.type);
      let previewUrl: string | undefined;
      if (kind !== "file" && typeof URL.createObjectURL === "function") {
        try {
          previewUrl = URL.createObjectURL(file);
          runtime.previews.set(id, previewUrl);
        } catch {
          // Preparing the real attachment can continue without a local thumbnail.
        }
      }
      runtime.files.set(id, file);
      dispatch(
        inboxActions.attachmentAdded({
          id,
          conversationId,
          kind,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          status: "preparing",
          previewUrl,
        }),
      );
      preparations.push(dispatch(prepareDraftAttachment(id)));
    }
    await Promise.all(preparations);
  };
}

function prepareDraftAttachment(id: string): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const attachment = getState().inbox.attachments[id];
    if (!attachment) return;
    const conversation =
      getState().inbox.conversations[attachment.conversationId];
    const file = runtime.files.get(id);
    if (!file || !conversation) return;
    const state = getState().inbox;
    const restriction = attachmentRestriction(
      conversation,
      state.connection,
      attachment,
      state.drafts[attachment.conversationId]?.attachmentIds.length ?? 0,
      runtime.now(),
    );
    if (restriction) {
      dispatch(inboxActions.attachmentFailed({ id, error: restriction }));
      return;
    }
    const target = sendTarget(conversation);
    await runOperation(
      runtime,
      requestKeys.attachment(id),
      getState,
      async (op) => {
        dispatch(inboxActions.attachmentPreparing(id));
        try {
          const response = await runtime.api.prepareAttachment({
            target,
            file,
            context: op.context,
            signal: op.signal,
          });
          if (!op.current() || !getState().inbox.attachments[id]) return;
          const media = readPreparedAttachment(response, attachment.kind);
          const current =
            getState().inbox.conversations[attachment.conversationId];
          if (!current || !isEqual(sendTarget(current), target)) {
            releaseAttachmentResources(runtime, [id]);
            dispatch(inboxActions.attachmentRemoved(id));
            return;
          }
          const latest = getState().inbox;
          const restriction = attachmentRestriction(
            current,
            latest.connection,
            media,
            latest.drafts[attachment.conversationId]?.attachmentIds.length ?? 0,
            runtime.now(),
          );
          if (restriction) throw new DeskApiError("business", restriction);
          dispatch(inboxActions.attachmentReady({ id, media }));
        } catch (error) {
          if (getState().inbox.attachments[id]) {
            op.settle(() =>
              dispatch(
                inboxActions.attachmentFailed({
                  id,
                  error: failureOf(error, "暂时无法连接服务，请稍后重试")
                    .message,
                }),
              ),
            );
          }
        }
      },
    );
  };
}

export function retryAttachment(id: string): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    if (getState().inbox.attachments[id]?.status === "failed")
      await dispatch(prepareDraftAttachment(id));
  };
}

export function removeAttachment(id: string): InboxCommand {
  return (dispatch, _getState, runtime) => {
    releaseAttachmentResources(runtime, [id]);
    dispatch(inboxActions.attachmentRemoved(id));
  };
}
