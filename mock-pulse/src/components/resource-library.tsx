import { forwardRef, type ReactNode } from "react";
import { type ListProps, Virtuoso } from "react-virtuoso";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ChannelMark } from "./channel-mark";
import { IconButton, StudioButton } from "./studio-controls";
import { StudioIcon } from "./studio-icon";
import { Input } from "./ui/input";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export type ResourceEntry = {
  id: string;
  name: string;
  description: string;
  channel?: ChannelId;
  icon?: ReactNode;
  favorite?: boolean;
};

const ResourceList = forwardRef<HTMLDivElement, ListProps>((props, ref) => (
  <div {...props} ref={ref} className="resource-virtual-list" />
));

export function ResourceFilters<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      className="filter-tabs"
      value={[value]}
      onValueChange={(values) => {
        if (values[0]) onChange(values[0] as T);
      }}
      aria-label="素材类型筛选"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn("filter-tab", value === option.value && "active")}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ResourceLibrary({
  title,
  singular,
  total,
  query,
  onQuery,
  onCreate,
  filters,
  entries,
  selectedId,
  onSelect,
  page,
  pages,
  filteredTotal,
  onPage,
  onClear,
  onContextMenu,
  error,
}: {
  title: string;
  singular: string;
  total: number;
  query: string;
  onQuery: (query: string) => void;
  onCreate?: () => void;
  filters?: ReactNode;
  entries: ResourceEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  pages: number;
  filteredTotal: number;
  onPage: (page: number) => void;
  onClear?: () => void;
  onContextMenu?: (id: string) => void;
  error?: string;
}) {
  return (
    <>
      <div className="library-heading">
        <h2>
          {title}
          <span className="count-inline">{total}</span>
        </h2>
        {onCreate ? (
          <IconButton label={`新建${singular}`} onClick={onCreate}>
            <StudioIcon name="plus" />
          </IconButton>
        ) : null}
      </div>
      <div className="library-tools">
        <div className="search">
          <StudioIcon name="search" />
          <Input
            aria-label={`搜索${singular}`}
            placeholder="搜索名称、平台或事件类型"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        {filters}
      </div>
      <div className="library-list">
        {error ? (
          <div className="empty" role="alert">
            <StudioIcon name="info" />
            <h3>读取素材失败</h3>
            <p>{error}</p>
          </div>
        ) : entries.length ? (
          <Virtuoso
            components={{ List: ResourceList }}
            style={{ height: "100%" }}
            data={entries}
            initialItemCount={entries.length}
            itemContent={(_index, item) => (
              <button
                type="button"
                className={cn(
                  "resource-item",
                  selectedId === item.id && "selected",
                )}
                aria-current={selectedId === item.id ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                onContextMenu={
                  onContextMenu
                    ? (event) => {
                        event.preventDefault();
                        onContextMenu(item.id);
                      }
                    : undefined
                }
              >
                {item.channel ? (
                  <ChannelMark channel={item.channel} />
                ) : (
                  <span className="platform-logo">
                    {item.icon ?? <StudioIcon name="plan" />}
                  </span>
                )}
                <span className="grow">
                  <span className="resource-title truncate resource-name">
                    {item.name}
                  </span>
                  <span className="resource-sub">{item.description}</span>
                </span>
                {item.favorite ? (
                  <span className="resource-mark">
                    <StudioIcon name="star" />
                  </span>
                ) : null}
              </button>
            )}
          />
        ) : (
          <div className="empty">
            <StudioIcon name="search" />
            <h3>
              {singular === "运行" ? "还没有运行记录" : "没有找到匹配的素材"}
            </h3>
            <p>
              {singular === "运行"
                ? "发送一条事件，或运行一个剧本后，快照与回执会出现在这里。"
                : "换一个关键词，或清除筛选条件。"}
            </p>
            {onClear ? (
              <StudioButton small onClick={onClear}>
                清除筛选
              </StudioButton>
            ) : null}
          </div>
        )}
      </div>
      <footer className="library-footer">
        <span>共 {filteredTotal} 项</span>
        <div className="pagination">
          <IconButton
            label="上一页"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <StudioIcon name="left" />
          </IconButton>
          <span className="page-number">
            {page} / {pages}
          </span>
          <IconButton
            label="下一页"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <StudioIcon name="right" />
          </IconButton>
        </div>
      </footer>
    </>
  );
}
