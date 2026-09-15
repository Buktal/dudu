import {
  ArrowUp,
  Check,
  ChevronRight,
  Image as ImageIcon,
  MessageCircle,
  Radio,
  RotateCcw,
  Rows3,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar, SourceTag } from "../components/identity";
import { Count, softSpring } from "../components/motion";
import {
  Brand,
  Button,
  Empty,
  IconButton,
  Modal,
} from "../components/primitives";
import { ChatPanel } from "../features/inbox/chat-panel";
import { QueueTabs, QueueTools } from "../features/inbox/conversation-list";
import type { Inbox } from "../features/inbox/use-inbox";
import { waitLabel } from "../lib/time";
import { channels, type Visitor } from "../types";
import { Details, type WorkspaceProps } from "../variants";

function QuickMessageCard({
  visitor,
  inbox,
  selected,
  onFocus,
  onDetails,
  onHistory,
  onNext,
}: {
  visitor: Visitor;
  inbox: Inbox;
  selected: boolean;
  onFocus: () => void;
  onDetails: () => void;
  onHistory: () => void;
  onNext: (id: string) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const latestIncoming = [...visitor.messages]
    .reverse()
    .find((message) => message.role === "visitor");
  const previousReply = [...visitor.messages]
    .reverse()
    .find((message) => message.role === "agent");
  const draft = inbox.drafts[visitor.id] ?? "";
  const blocked = !visitor.replyOpen || visitor.status === "ended";
  function send(next = false) {
    if (draft.trim() && !blocked) {
      onFocus();
      inbox.send(
        visitor.id,
        draft,
        "text",
        next ? () => onNext(visitor.id) : undefined,
      );
    }
  }
  return (
    <motion.article
      layout="position"
      transition={softSpring}
      ref={cardRef}
      className={`quick-card ${selected ? "quick-card-selected" : ""}`}
      aria-label={`${visitor.name} 的最新消息，${channels[visitor.channel].name}`}
    >
      <header className="quick-card-header">
        <button
          type="button"
          className="quick-card-person"
          onClick={onDetails}
          aria-label={`查看 ${visitor.name} 的资料，${channels[visitor.channel].name}`}
        >
          <Avatar visitor={visitor} />
          <span>
            <strong>{visitor.name}</strong>
            <span>
              <SourceTag channel={visitor.channel} />
              <small>{visitor.account}</small>
            </span>
          </span>
        </button>
        <span
          className={`quick-wait ${visitor.wait >= 180 ? "wait-urgent" : ""}`}
        >
          {visitor.status === "needs-reply"
            ? visitor.wait
              ? `等待 ${waitLabel(visitor.wait)}`
              : "待回复"
            : visitor.status === "ended"
              ? "已结束"
              : "已回复"}
        </span>
      </header>
      <div className="quick-question">
        <span className="quick-message-type">
          最新来信 <time>{latestIncoming?.time}</time>
        </span>
        {latestIncoming?.kind === "text" ? (
          <p>{latestIncoming.text}</p>
        ) : (
          <button type="button" className="quick-media" onClick={onHistory}>
            {latestIncoming?.kind === "image" ? (
              <ImageIcon size={19} />
            ) : (
              <MessageCircle size={19} />
            )}
            <span>
              {latestIncoming?.kind === "voice"
                ? "访客发来了一段语音 · 12 秒"
                : latestIncoming?.kind === "image"
                  ? "访客发来了一张图片"
                  : "访客分享了一张消息卡片"}
            </span>
            <ChevronRight size={15} />
          </button>
        )}
      </div>
      {previousReply && (
        <div
          className={`quick-previous ${previousReply.status === "failed" ? "quick-previous-failed" : ""}`}
        >
          <span>
            {previousReply.status === "failed"
              ? "发送失败"
              : previousReply.status === "sending"
                ? "发送中"
                : "上次回复"}
          </span>
          <p>{previousReply.text}</p>
          {previousReply.status === "failed" && (
            <IconButton
              icon={RotateCcw}
              label={`重试给 ${visitor.name} 的消息`}
              onClick={() => inbox.retry(visitor.id, previousReply.id)}
            />
          )}
        </div>
      )}
      <div className="quick-reply">
        <label>
          <span>
            回复给 {visitor.name} · {channels[visitor.channel].short}
          </span>
          <textarea
            aria-label={`快速回复 ${visitor.name}，${channels[visitor.channel].name}`}
            placeholder={
              blocked ? "当前会话不可回复" : "一句话回复，也可以先写下草稿…"
            }
            value={draft}
            disabled={blocked}
            rows={2}
            onFocus={onFocus}
            onChange={(event) =>
              inbox.updateDraft(visitor.id, event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                send(event.ctrlKey || event.metaKey);
              }
            }}
          />
        </label>
        <div className="quick-reply-actions">
          <button type="button" onClick={onHistory}>
            <Rows3 size={12} />
            完整对话
            <ChevronRight size={11} />
          </button>
          <span>
            {blocked
              ? !visitor.replyOpen
                ? "回复窗口已结束"
                : "接待已结束"
              : selected
                ? "当前输入对象"
                : "Enter 发送"}
          </span>
          <Button
            size="icon-sm"
            disabled={blocked || !draft.trim()}
            onClick={() => send()}
            aria-label={`快速发送给 ${visitor.name}，${channels[visitor.channel].name}`}
          >
            <ArrowUp data-icon="inline-start" />
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

export function VariantE(props: WorkspaceProps) {
  const [historyId, setHistoryId] = useState<string | null>(null);
  const order = useRef(props.inbox.visitors.map((visitor) => visitor.id));
  const cards = [...props.queue].sort(
    (left, right) =>
      order.current.indexOf(left.id) - order.current.indexOf(right.id),
  );
  const historyVisitor = props.inbox.visitors.find(
    (visitor) => visitor.id === historyId,
  );
  const pending = props.inbox.visitors.filter(
    (visitor) => visitor.status === "needs-reply",
  ).length;
  return (
    <div className={`stream-shell ${props.infoOpen ? "with-info" : ""}`}>
      <header className="stream-app-header">
        <Brand />
        <span className="header-divider" />
        <div className="stream-app-title">
          <Radio size={18} />
          <h1>消息速答</h1>
        </div>
        <div className="app-header-right">
          <span className="prototype-badge">新方向 · 05</span>
          <Button size="sm" variant="ghost" onClick={props.openHelp}>
            设计说明
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => props.setInfoOpen(!props.infoOpen)}
          >
            访客信息
          </Button>
        </div>
      </header>
      <div className="stream-workspace">
        <main className="stream-main">
          <div className="stream-heading">
            <div>
              <span className="stream-eyebrow">每个问题，都有回应</span>
              <h2>
                先看消息，再展开对话
                <span>
                  <Count value={pending} /> 位待回应
                </span>
              </h2>
              <p>每位访客一张卡。简单的问题，就在这里回复。</p>
            </div>
            <div className="stream-rule">
              <Check size={13} />
              回复对象固定在每张卡片上
            </div>
          </div>
          <div className="stream-toolbar">
            <QueueTabs
              visitors={props.inbox.visitors}
              value={props.options.filter}
              onChange={(filter) => props.setOptions({ filter })}
            />
            <QueueTools
              options={props.options}
              onChange={props.setOptions}
              compact
              showOrder={false}
            />
          </div>
          <div className="stream-card-scroll">
            <div className="stream-cards">
              {cards.length ? (
                cards.map((visitor) => (
                  <QuickMessageCard
                    key={visitor.id}
                    visitor={visitor}
                    inbox={props.inbox}
                    selected={props.visitor.id === visitor.id}
                    onNext={props.next}
                    onFocus={() => props.select(visitor.id)}
                    onDetails={() => {
                      props.select(visitor.id);
                      props.setInfoOpen(true);
                    }}
                    onHistory={() => {
                      props.select(visitor.id);
                      setHistoryId(visitor.id);
                    }}
                  />
                ))
              ) : (
                <Empty>
                  <p>当前没有匹配的消息</p>
                  <small>试试更换会话状态或消息来源</small>
                </Empty>
              )}
            </div>
          </div>
        </main>
        <Details {...props} />
      </div>
      <AnimatePresence>
        {historyVisitor && (
          <Modal
            title={`与 ${historyVisitor.name} 的完整对话`}
            onClose={() => setHistoryId(null)}
            wide
          >
            <div className="stream-history">
              <ChatPanel
                visitor={historyVisitor}
                inbox={props.inbox}
                onFocus={() => props.inbox.markRead(historyVisitor.id)}
                onNext={(id) => {
                  props.next(id);
                  setHistoryId(null);
                }}
                onInfo={() => {
                  setHistoryId(null);
                  props.setInfoOpen(true);
                }}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
