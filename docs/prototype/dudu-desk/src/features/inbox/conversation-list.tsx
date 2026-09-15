import { Columns2, Search, Star } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { Avatar, SourceTag } from "../../components/identity";
import { Count, softSpring } from "../../components/motion";
import { Empty, IconButton } from "../../components/primitives";
import { waitLabel } from "../../lib/time";
import { channels, type Visitor } from "../../types";
import type { Inbox } from "./use-inbox";

export type QueueFilter =
  | "all"
  | "needs-reply"
  | "waiting"
  | "ended"
  | "starred";
export type QueueOptions = {
  query: string;
  filter: QueueFilter;
  channel: string;
  order: "wait" | "recent";
};
export function filterVisitors(visitors: Visitor[], options: QueueOptions) {
  const query = options.query.trim().toLowerCase();
  return visitors
    .filter((visitor) => {
      const statusMatch =
        options.filter === "all"
          ? visitor.status !== "ended"
          : options.filter === "starred"
            ? visitor.starred
            : visitor.status === options.filter;
      const searchText = [
        visitor.name,
        channels[visitor.channel].name,
        visitor.account,
        visitor.handle,
        ...visitor.tags,
        ...visitor.messages.map((message) => message.text),
      ]
        .join(" ")
        .toLowerCase();
      return (
        statusMatch &&
        (options.channel === "all" || visitor.channel === options.channel) &&
        (!query || searchText.includes(query))
      );
    })
    .sort((a, b) =>
      options.order === "wait"
        ? (b.status === "needs-reply" ? 1 : 0) -
            (a.status === "needs-reply" ? 1 : 0) || b.wait - a.wait
        : b.messages.length - a.messages.length,
    );
}

export function QueueTools({
  options,
  onChange,
  compact = false,
  showOrder = true,
}: {
  options: QueueOptions;
  onChange: (change: Partial<QueueOptions>) => void;
  compact?: boolean;
  showOrder?: boolean;
}) {
  return (
    <div className={`queue-tools ${compact ? "queue-tools-compact" : ""}`}>
      <label className="search-field">
        <Search size={15} />
        <input
          type="search"
          aria-label="搜索访客或消息"
          placeholder="搜索访客或消息"
          value={options.query}
          onChange={(event) => onChange({ query: event.target.value })}
        />
        <kbd>Ctrl K</kbd>
      </label>
      <div className="queue-selects">
        <select
          aria-label="按消息来源筛选"
          value={options.channel}
          onChange={(event) => onChange({ channel: event.target.value })}
        >
          <option value="all">全部来源</option>
          {Object.entries(channels).map(([key, channel]) => (
            <option key={key} value={key}>
              {channel.name}
            </option>
          ))}
        </select>
        {showOrder && (
          <select
            aria-label="会话排序"
            value={options.order}
            onChange={(event) =>
              onChange({ order: event.target.value as QueueOptions["order"] })
            }
          >
            <option value="wait">等待最久</option>
            <option value="recent">消息最多</option>
          </select>
        )}
      </div>
    </div>
  );
}

export function QueueTabs({
  visitors,
  value,
  onChange,
}: {
  visitors: Visitor[];
  value: QueueFilter;
  onChange: (value: QueueFilter) => void;
}) {
  const group = useId();
  const active = visitors.filter(
    (visitor) => visitor.status !== "ended",
  ).length;
  const needs = visitors.filter(
    (visitor) => visitor.status === "needs-reply",
  ).length;
  return (
    <LayoutGroup id={group}>
      <fieldset className="queue-tabs" aria-label="会话状态">
        <button
          type="button"
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
        >
          {value === "all" && (
            <motion.span
              className="queue-tab-selection"
              layoutId="queue-tab"
              transition={softSpring}
            />
          )}
          全部{" "}
          <span className="tab-count">
            <Count value={active} />
          </span>
        </button>
        <button
          type="button"
          aria-pressed={value === "needs-reply"}
          onClick={() => onChange("needs-reply")}
        >
          {value === "needs-reply" && (
            <motion.span
              className="queue-tab-selection"
              layoutId="queue-tab"
              transition={softSpring}
            />
          )}
          待回复{" "}
          <span className="tab-count">
            <Count value={needs} />
          </span>
        </button>
        <button
          type="button"
          aria-pressed={value === "ended"}
          onClick={() => onChange("ended")}
        >
          {value === "ended" && (
            <motion.span
              className="queue-tab-selection"
              layoutId="queue-tab"
              transition={softSpring}
            />
          )}
          已结束
        </button>
      </fieldset>
    </LayoutGroup>
  );
}

export function ConversationRow({
  visitor,
  selected,
  draft,
  onSelect,
  onParallel,
  compact = false,
}: {
  visitor: Visitor;
  selected: boolean;
  draft?: string;
  onSelect: () => void;
  onParallel?: () => void;
  compact?: boolean;
}) {
  const last = visitor.messages.at(-1);
  const preview =
    last?.kind === "image"
      ? "[图片] 参考图片"
      : last?.kind === "voice"
        ? "[语音] 12 秒"
        : last?.kind === "product"
          ? `[商品] ${last.text}`
          : last?.text;
  return (
    <motion.div
      layout="position"
      transition={softSpring}
      className={`conversation-row ${selected ? "selected" : ""} ${compact ? "row-compact" : ""}`}
    >
      {selected && (
        <motion.span
          className="row-selection"
          layoutId="selected-visitor"
          transition={softSpring}
        />
      )}
      <button
        type="button"
        className="conversation-hit"
        onClick={onSelect}
        aria-label={`接待 ${visitor.name}，${channels[visitor.channel].name}${visitor.status === "needs-reply" ? "，待回复" : ""}`}
        aria-pressed={selected}
      >
        <Avatar visitor={visitor} />
        <span className="conversation-content">
          <span className="row-heading">
            <strong>{visitor.name}</strong>
            {visitor.starred && <Star size={11} className="star-filled" />}
            <span
              className={`wait-time ${visitor.wait >= 180 ? "wait-urgent" : ""}`}
            >
              {visitor.status === "needs-reply" && visitor.wait
                ? waitLabel(visitor.wait)
                : last?.time}
            </span>
          </span>
          <span className="row-preview">
            {draft ? (
              <>
                <em>草稿</em> {draft}
              </>
            ) : (
              preview
            )}
          </span>
          <span className="row-meta">
            <SourceTag channel={visitor.channel} />
            {!compact && <span className="row-topic">{visitor.tags[0]}</span>}
            {visitor.unread > 0 && (
              <span className="unread-count">{visitor.unread}</span>
            )}
          </span>
        </span>
      </button>
      {onParallel && (
        <span className="parallel-action">
          <IconButton
            icon={Columns2}
            label={`并排打开 ${visitor.name}`}
            onClick={onParallel}
          />
        </span>
      )}
    </motion.div>
  );
}

export function ConversationList({
  visitors,
  inbox,
  selectedId,
  onSelect,
  onParallel,
  compact = false,
}: {
  visitors: Visitor[];
  inbox: Inbox;
  selectedId: string;
  onSelect: (id: string) => void;
  onParallel?: (id: string) => void;
  compact?: boolean;
}) {
  const group = useId();
  return (
    <LayoutGroup id={group}>
      <motion.section
        layoutScroll
        className="conversation-list"
        aria-label="来访用户会话列表"
      >
        {visitors.length ? (
          visitors.map((visitor) => (
            <ConversationRow
              key={visitor.id}
              visitor={visitor}
              selected={visitor.id === selectedId}
              draft={inbox.drafts[visitor.id]}
              onSelect={() => onSelect(visitor.id)}
              onParallel={onParallel ? () => onParallel(visitor.id) : undefined}
              compact={compact}
            />
          ))
        ) : (
          <Empty>
            <p>没有符合条件的会话</p>
            <small>试试其他关键词或消息来源</small>
          </Empty>
        )}
      </motion.section>
    </LayoutGroup>
  );
}
