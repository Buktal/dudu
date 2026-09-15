import { Check, ChevronDown, PanelRight, Star } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar, SourceTag } from "../../components/identity";
import { SoftReveal } from "../../components/motion";
import { Button, IconButton } from "../../components/primitives";
import type { Visitor } from "../../types";
import { Composer } from "./composer";
import { MessageView } from "./message";
import type { Inbox } from "./use-inbox";

export function ChatPanel({
  visitor,
  inbox,
  mode = "standard",
  focused = true,
  paneLabel,
  onFocus,
  onNext,
  onInfo,
}: {
  visitor: Visitor;
  inbox: Inbox;
  mode?: "standard" | "parallel";
  focused?: boolean;
  paneLabel?: string;
  onFocus: () => void;
  onNext: (id: string) => void;
  onInfo: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef(true);
  const lastVisitor = useRef(visitor.id);
  const [newBelow, setNewBelow] = useState(false);
  const count = visitor.messages.length;
  const { markRead } = inbox;
  useEffect(() => {
    if (
      scroller.current &&
      (bottom.current || lastVisitor.current !== visitor.id)
    ) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
      setNewBelow(false);
      if (focused) markRead(visitor.id);
    } else setNewBelow(true);
    lastVisitor.current = visitor.id;
  }, [visitor.id, count, focused, markRead]);

  function end() {
    inbox.patch(visitor.id, { status: "ended", unread: 0 });
    inbox.notify(`${visitor.name} 的本次接待已结束，可在输入区继续接待`);
  }
  return (
    <motion.section
      layout="position"
      initial={{ opacity: 0, x: 5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.18 }}
      className={`chat-panel chat-${mode} ${focused ? "chat-focused" : ""}`}
      aria-label={`${visitor.name} 的聊天`}
    >
      {mode === "parallel" && (
        <button
          type="button"
          className="pane-focus-bar"
          aria-pressed={focused}
          onClick={onFocus}
        >
          <span className="focus-indicator" />
          {paneLabel ?? "接待窗口"}
          <span className="pane-focus-hint">
            {focused ? "当前回复" : "点击切换 · 草稿独立"}
          </span>
        </button>
      )}
      <header className="chat-header">
        <Avatar visitor={visitor} />
        <div className="chat-person">
          <div>
            <h2>{visitor.name}</h2>
            <span className="chat-status">
              {visitor.status === "ended"
                ? "已结束"
                : visitor.status === "waiting"
                  ? "等待访客"
                  : "正在接待"}
            </span>
          </div>
          <p>
            <SourceTag channel={visitor.channel} />
            <span className="chat-account">{visitor.account}</span>
          </p>
        </div>
        <div className="chat-header-actions">
          <IconButton
            icon={Star}
            label={
              visitor.starred
                ? `取消星标 ${visitor.name}`
                : `星标 ${visitor.name}`
            }
            active={visitor.starred}
            onClick={() =>
              inbox.patch(visitor.id, { starred: !visitor.starred })
            }
          />
          <IconButton
            icon={PanelRight}
            label={`查看 ${visitor.name} 的访客信息`}
            onClick={() => {
              onFocus();
              onInfo();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={`结束 ${visitor.name} 的接待`}
            title="结束接待"
            disabled={visitor.status === "ended"}
            onClick={end}
          >
            <Check data-icon="inline-start" />
            <span className="end-label">结束接待</span>
          </Button>
        </div>
      </header>
      <div
        ref={scroller}
        className="message-scroller"
        onScroll={() => {
          const element = scroller.current;
          if (element) {
            bottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              60;
            if (bottom.current) setNewBelow(false);
          }
        }}
      >
        <SoftReveal key={visitor.id} className="message-history">
          <div className="date-marker">
            <span />9 月 15 日<span />
          </div>
          <p className="conversation-start">{visitor.name} 发起了会话</p>
          {visitor.messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              visitor={visitor}
              onRetry={() => inbox.retry(visitor.id, message.id)}
            />
          ))}
        </SoftReveal>
      </div>
      {newBelow && (
        <button
          type="button"
          className="jump-latest"
          onClick={() => {
            if (scroller.current)
              scroller.current.scrollTop = scroller.current.scrollHeight;
            setNewBelow(false);
            bottom.current = true;
          }}
        >
          <ChevronDown size={14} />
          查看最新消息
        </button>
      )}
      <Composer
        key={visitor.id}
        visitor={visitor}
        inbox={inbox}
        onFocus={onFocus}
        onNext={onNext}
      />
    </motion.section>
  );
}
