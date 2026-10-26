import { useLayoutEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { FloatingAssistant } from "@/features/assistant";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { adoptAssistantReply } from "../stores/assistant";
import { openQuickHistory } from "../stores/parallel";
import { selectFocusedId } from "../stores/selectors";
import { visitorName } from "./identity";

export function InboxAssistant() {
  const { mode } = useTheme();
  const historyId = useInboxSelector((state) => state.inbox.quickHistoryId);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (mode !== "quick" || !historyId) {
      setContainer(null);
      return;
    }
    const frame = requestAnimationFrame(() =>
      setContainer(
        document.querySelector<HTMLElement>("[data-desk-assistant-host]"),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [mode, historyId]);
  const dispatch = useInboxDispatch();
  const id = useInboxSelector(selectFocusedId);
  const conversation = useInboxSelector((state) =>
    id ? state.inbox.conversations[id] : undefined,
  );
  const draft = useInboxSelector((state) =>
    id ? (state.inbox.drafts[id]?.text ?? "") : "",
  );
  const generation = useInboxSelector((state) => state.inbox.generation);
  return (
    <FloatingAssistant
      key={generation}
      container={container}
      target={
        conversation
          ? {
              id: conversation.id,
              name: visitorName(conversation.identity),
              channel: conversation.identity.channelName,
            }
          : undefined
      }
      draft={draft}
      onApply={(visitorId, text, expected) => {
        const adopted = dispatch(
          adoptAssistantReply(visitorId, text, expected, generation),
        );
        if (adopted && mode === "quick") dispatch(openQuickHistory(visitorId));
        return adopted;
      }}
    />
  );
}
