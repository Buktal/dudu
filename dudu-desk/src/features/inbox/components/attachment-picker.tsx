import { Paperclip } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFileSize } from "@/lib/attachment-utils";
import { nowIso } from "@/lib/time";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  attachmentAccept,
  attachmentEntryRestriction,
} from "../reply/attachment-rules";
import { addAttachments } from "../stores/attachments";
import { selectConversationById } from "../stores/selectors";
import { focusReply } from "../stores/sending";

export function AttachmentPicker({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useInboxDispatch();
  const input = useRef<HTMLInputElement>(null);
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const connection = useInboxSelector((state) => state.inbox.connection);
  const count = useInboxSelector(
    (state) => state.inbox.drafts[conversationId]?.attachmentIds.length ?? 0,
  );
  const restriction = attachmentEntryRestriction(
    conversation,
    connection,
    count,
    nowIso(),
  );
  const limits = conversation?.capability.attachments;
  const description =
    restriction ||
    (limits
      ? `添加附件 · 最多 ${limits.maxCount} 个，单个不超过 ${formatFileSize(limits.maxBytes)}`
      : "添加附件");
  return (
    <span className="inline-flex" title={description}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="添加附件"
        disabled={!!restriction}
        onClick={() => {
          dispatch(focusReply(conversationId));
          input.current?.click();
        }}
      >
        <Paperclip />
      </Button>
      <Input
        ref={input}
        type="file"
        multiple
        hidden
        accept={attachmentAccept(conversation?.capability)}
        aria-label="选择待发送的附件"
        disabled={!!restriction}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length)
            void dispatch(addAttachments(conversationId, files));
        }}
      />
    </span>
  );
}
