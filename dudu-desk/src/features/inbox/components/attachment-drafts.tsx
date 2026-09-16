import {
  AudioLines,
  FileText,
  Film,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { formatFileSize, safeAssetUrl } from "@/lib/attachment-utils";
import { nowIso } from "@/lib/time";
import { attachmentRestriction } from "../attachment-rules";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { removeAttachment, retryAttachment } from "../stores/attachments";
import { selectConversationById } from "../stores/selectors";
import type { DraftAttachment } from "../stores/state";

const icons = {
  image: ImageIcon,
  audio: AudioLines,
  video: Film,
  file: FileText,
};
const states = {
  preparing: "uploading",
  failed: "error",
  ready: "done",
} as const;

export function AttachmentDrafts({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useInboxDispatch();
  const draft = useInboxSelector((state) => state.inbox.drafts[conversationId]);
  const attachments = useInboxSelector((state) => state.inbox.attachments);
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const connection = useInboxSelector((state) => state.inbox.connection);
  if (!draft?.attachmentIds.length) return null;
  return (
    <AttachmentGroup
      className="px-3 pb-2"
      aria-label="这位来访用户的待发送附件"
    >
      {draft.attachmentIds.map((id) => {
        const attachment = attachments[id];
        if (!attachment) return null;
        const restriction = attachmentRestriction(
          conversation,
          connection,
          attachment,
          draft.attachmentIds.length,
          nowIso(),
        );
        return (
          <Attachment key={id} size="sm" state={states[attachment.status]}>
            <DraftMedia key={attachment.previewUrl} attachment={attachment} />
            <AttachmentContent className="max-w-56">
              <AttachmentTitle title={attachment.name}>
                {attachment.name}
              </AttachmentTitle>
              <AttachmentDescription
                title={attachment.error}
                aria-live="polite"
              >
                {attachment.status === "failed"
                  ? attachment.error || "准备失败"
                  : `${formatFileSize(attachment.size)} · ${attachment.status === "preparing" ? "准备中" : "待发送"}`}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              {attachment.status === "failed" && (
                <AttachmentAction
                  aria-label={`重新准备 ${attachment.name}`}
                  title={restriction || "重新准备附件"}
                  disabled={!!restriction}
                  onClick={() => void dispatch(retryAttachment(id))}
                >
                  <RotateCcw />
                </AttachmentAction>
              )}
              <AttachmentAction
                aria-label={`移除 ${attachment.name}`}
                title="移除附件"
                onClick={() => dispatch(removeAttachment(id))}
              >
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        );
      })}
    </AttachmentGroup>
  );
}

function DraftMedia({ attachment }: { attachment: DraftAttachment }) {
  const [failed, setFailed] = useState(false);
  const source =
    attachment.kind === "image" && !failed
      ? safeAssetUrl(attachment.previewUrl, "image")
      : null;
  const Icon = icons[attachment.kind];
  return (
    <AttachmentMedia variant={source ? "image" : "icon"}>
      {source ? (
        <img src={source} alt="" onError={() => setFailed(true)} />
      ) : attachment.status === "preparing" ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <Icon />
      )}
    </AttachmentMedia>
  );
}
