import {
  Check,
  ChevronDown,
  ChevronUp,
  ListCollapse,
  PanelRight,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Avatar, SourceTag } from "../components/identity";
import { Brand, Button, Empty, IconButton } from "../components/primitives";
import { ChatPanel } from "../features/inbox/chat-panel";
import {
  filterVisitors,
  type QueueOptions,
  QueueTabs,
  QueueTools,
} from "../features/inbox/conversation-list";
import { waitLabel } from "../lib/time";
import { channels, type Visitor } from "../types";
import { Details, type WorkspaceProps } from "../variants";

function FoldHeader({
  visitor,
  open,
  draft,
  onClick,
}: {
  visitor: Visitor;
  open: boolean;
  draft: string;
  onClick: () => void;
}) {
  const last = visitor.messages.at(-1);
  return (
    <button
      type="button"
      className="fold-row-button"
      onClick={onClick}
      aria-label={`${open ? "收起" : "展开"} ${visitor.name} 的会话，${channels[visitor.channel].name}`}
      aria-expanded={open}
    >
      <span className="fold-identity">
        <Avatar visitor={visitor} size="small" />
        <span>
          <strong>{visitor.name}</strong>
          <SourceTag channel={visitor.channel} />
        </span>
      </span>
      <span className="fold-preview">
        {draft ? (
          <>
            <em>草稿</em> {draft}
          </>
        ) : last?.kind === "text" ? (
          last.text
        ) : (
          `[${last?.kind === "voice" ? "语音" : last?.kind === "image" ? "图片" : "消息卡片"}] ${last?.text}`
        )}
      </span>
      <span
        className={`fold-status ${visitor.status === "needs-reply" ? "is-waiting" : ""}`}
      >
        <i />
        {!visitor.replyOpen
          ? "回复受限"
          : visitor.status === "needs-reply"
            ? "待回复"
            : visitor.status === "ended"
              ? "已结束"
              : "等待访客"}
      </span>
      <span className={`fold-wait ${visitor.wait >= 180 ? "wait-urgent" : ""}`}>
        {visitor.wait ? waitLabel(visitor.wait) : "—"}
      </span>
      <span className="fold-toggle">
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </span>
    </button>
  );
}

export function VariantD(props: WorkspaceProps) {
  const [expanded, setExpanded] = useState(true);
  const expandedRow = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const order = useRef(props.queue.map((visitor) => visitor.id));
  const rows = [...props.queue].sort((left, right) => {
    const rank = (id: string) => {
      const index = order.current.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return rank(left.id) - rank(right.id);
  });
  const activeId = props.visitor.id;
  useLayoutEffect(() => {
    if (expanded && activeId && expandedRow.current && listRef.current)
      listRef.current.scrollTop = Math.max(
        0,
        expandedRow.current.offsetTop - 2,
      );
  }, [activeId, expanded]);
  function changeOptions(change: Partial<QueueOptions>) {
    if (change.order)
      order.current = filterVisitors(props.inbox.visitors, {
        ...props.options,
        filter: "all",
        query: "",
        channel: "all",
        ...change,
      }).map((visitor) => visitor.id);
    props.setOptions(change);
  }
  function choose(id: string) {
    if (id === props.visitor.id) setExpanded(!expanded);
    else {
      props.select(id);
      setExpanded(true);
    }
  }
  return (
    <div className={`fold-shell ${props.infoOpen ? "with-info" : ""}`}>
      <header className="fold-app-header">
        <Brand />
        <span className="header-divider" />
        <div className="fold-heading">
          <ListCollapse size={18} />
          <h1>会话展开</h1>
        </div>
        <span className="fold-instruction">点击一行，直接开始对话</span>
        <div className="app-header-right">
          <span className="prototype-badge">新方向 · 04</span>
          <Button variant="ghost" size="sm" onClick={props.openHelp}>
            设计说明
          </Button>
          <IconButton
            icon={PanelRight}
            label="展开或收起访客信息"
            onClick={() => props.setInfoOpen(!props.infoOpen)}
          />
        </div>
      </header>
      <div className="fold-workspace">
        <main className="fold-inbox">
          <div className="fold-toolbar">
            <QueueTabs
              visitors={props.inbox.visitors}
              value={props.options.filter}
              onChange={(filter) => props.setOptions({ filter })}
            />
            <QueueTools
              options={props.options}
              onChange={changeOptions}
              compact
            />
          </div>
          <div className="fold-column-labels">
            <span>访客 / 来源</span>
            <span>最近一条消息</span>
            <span>接待状态</span>
            <span>等待</span>
            <span />
          </div>
          <div className="fold-list" ref={listRef}>
            {rows.length ? (
              rows.map((visitor) => {
                const open = expanded && visitor.id === props.visitor.id;
                return (
                  <article
                    className={`fold-row ${open ? "fold-row-open" : ""}`}
                    key={visitor.id}
                    ref={open ? expandedRow : undefined}
                  >
                    <FoldHeader
                      visitor={visitor}
                      open={open}
                      draft={props.inbox.drafts[visitor.id] ?? ""}
                      onClick={() => choose(visitor.id)}
                    />
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          className="fold-expansion"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: 0.24,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <div className="fold-expanded">
                            <div className="fold-chat-caption">
                              <span>
                                <i />
                                正在这段对话中回复 · {visitor.name}
                              </span>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  props.inbox.patch(visitor.id, {
                                    status: "ended",
                                  });
                                  props.inbox.notify(
                                    "本次接待已结束，消息与草稿仍然保留",
                                  );
                                }}
                                disabled={visitor.status === "ended"}
                              >
                                <Check data-icon="inline-start" />
                                结束接待
                              </Button>
                            </div>
                            <ChatPanel
                              visitor={visitor}
                              inbox={props.inbox}
                              mode="inline"
                              onFocus={() => props.inbox.markRead(visitor.id)}
                              onNext={props.next}
                              onInfo={() => props.setInfoOpen(true)}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </article>
                );
              })
            ) : (
              <Empty>
                <p>没有符合条件的会话</p>
                <small>更换关键词或清空来源筛选</small>
              </Empty>
            )}
          </div>
          <div className="fold-footer">
            <span>{props.queue.length} 位访客 · 回复后保持列表位置</span>
            <button
              type="button"
              disabled={
                !props.queue.some((visitor) => visitor.id === props.visitor.id)
              }
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起当前对话，浏览完整清单" : "展开当前访客的对话"}
              <ListCollapse size={13} />
            </button>
          </div>
        </main>
        <Details {...props} />
      </div>
    </div>
  );
}
