import { useTheme } from "@/components/theme-provider";
import { FloatingAssistant } from "@/features/assistant";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { adoptAssistantReply } from "../stores/assistant";
import { openQuickHistory } from "../stores/parallel";
import { selectFocusedId } from "../stores/selectors";
import { useAssistantHost } from "./assistant-host";
import { visitorName } from "./identity";

export function InboxAssistant() {
  const { mode } = useTheme();
  // 宿主节点由 quick 历史弹层经 React 数据流上供（见 assistant-host.tsx）：
  // 弹层未挂载时没有宿主，浮层保持 fixed，不再依赖一次性 DOM 查询的时序
  const container = useAssistantHost();
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
