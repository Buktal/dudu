import {
  ArrowUpRight,
  Check,
  ChevronDown,
  PanelRight,
  Star,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar, SourceTag } from "../../components/identity";
import { SoftReveal } from "../../components/motion";
import { Button, IconButton } from "../../components/primitives";
import { cn } from "../../lib/utils";
import type { Visitor } from "../../types";
import { Composer } from "./composer";
import { MessageView } from "./message";
import type { Inbox } from "./use-inbox";

export function ChatPanel({
  visitor,
  inbox,
  mode = "standard",
  focused = true,
  paneRole = "primary",
  onFocus,
  onNext,
  onInfo,
}: {
  visitor: Visitor;
  inbox: Inbox;
  mode?: "standard" | "parallel";
  focused?: boolean;
  paneRole?: "primary" | "pinned";
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
      className={cn("chat-panel", `chat-${mode}`, focused && "chat-focused")}
      aria-label={`${visitor.name} 的聊天`}
    >
      <header className="chat-header">
        <Avatar visitor={visitor} />
        <div className="chat-person">
          <div>
            <h2>{visitor.name}</h2>
            {mode === "parallel" ? (
              <span
                className="pane-role"
                title={
                  paneRole === "pinned"
                    ? "固定在右窗，不随会话列表切换"
                    : "跟随左侧会话列表切换"
                }
              >
                {paneRole === "pinned" ? "固定接待" : "主接待"}
              </span>
            ) : (
              <span className="chat-status">
                {visitor.status === "ended"
                  ? "已结束"
                  : visitor.status === "waiting"
                    ? "等待访客"
                    : "正在接待"}
              </span>
            )}
          </div>
          <p>
            <SourceTag channel={visitor.channel} />
            <span className="chat-account">{visitor.account}</span>
          </p>
        </div>
        <div className="chat-header-controls">
          {mode === "parallel" && (
            <Button
              className="pane-focus-trigger"
              variant={focused ? "secondary" : "ghost"}
              size="xs"
              aria-label={`设为当前回复：${visitor.name}`}
              aria-pressed={focused}
              title={
                focused ? "正在回复这位访客" : "切换回复对象，保留两边的草稿"
              }
              onClick={onFocus}
            >
              {focused ? (
                <span className="focus-indicator" aria-hidden="true" />
              ) : (
                <ArrowUpRight data-icon="inline-start" />
              )}
              {focused ? "当前回复" : "切换回复"}
            </Button>
          )}
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
              variant={mode === "parallel" ? "ghost" : "outline"}
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
