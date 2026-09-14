import { forwardRef, type ReactNode } from "react";
import { type ListProps, Virtuoso } from "react-virtuoso";
import { IconButton } from "@/components/icon-button";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ChannelMark } from "./channel-mark";

import { StudioIcon } from "./studio-icon";
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
  <div {...props} ref={ref} className="flex flex-col gap-1 px-2 pb-2" />
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
      className="w-full"
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
          className={cn("flex-1", value === option.value && "")}
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
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-3">
        <h2>
          {title}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {total}
          </span>
        </h2>
        {onCreate ? (
          <IconButton label={`新建${singular}`} onClick={onCreate}>
            <StudioIcon name="plus" />
          </IconButton>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
        <div className="min-w-0 flex-1">
          <SearchInput
            aria-label={`搜索${singular}`}
            placeholder="搜索名称、平台或事件类型"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        {filters}
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <Empty role="alert">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StudioIcon name="info" />
              </EmptyMedia>
              <EmptyTitle>读取素材失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
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
                  "flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selectedId === item.id &&
                    "bg-secondary text-secondary-foreground",
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
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {item.icon ?? <StudioIcon name="plan" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">
                    {item.name}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                {item.favorite ? (
                  <span className="ml-auto text-primary">
                    <StudioIcon name="star" />
                  </span>
                ) : null}
              </button>
            )}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StudioIcon name="search" />
              </EmptyMedia>
              <EmptyTitle>
                {singular === "运行" ? "还没有运行记录" : "没有找到匹配的素材"}
              </EmptyTitle>
              <EmptyDescription>
                {singular === "运行"
                  ? "发送一条事件，或运行一个剧本后，快照与回执会出现在这里。"
                  : "换一个关键词，或清除筛选条件。"}
              </EmptyDescription>
            </EmptyHeader>
            {onClear ? (
              <Button size="sm" onClick={onClear} variant="outline">
                清除筛选
              </Button>
            ) : null}
          </Empty>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>共 {filteredTotal} 项</span>
        <div className="flex items-center gap-2">
          <IconButton
            label="上一页"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <StudioIcon name="left" />
          </IconButton>
          <span className="font-mono tabular-nums">
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
