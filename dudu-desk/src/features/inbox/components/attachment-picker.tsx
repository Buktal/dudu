import { Paperclip } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { attachmentEntryRestriction } from "../reply/attachment-rules";
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
  const restriction = attachmentEntryRestriction(conversation, connection);
  const description = restriction || "添加附件";
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
