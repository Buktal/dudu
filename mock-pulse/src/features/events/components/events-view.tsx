import { ChevronLeft, ChevronRight, Plus, Search, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Virtuoso } from "react-virtuoso";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchConnections } from "@/features/connections";
import { CHANNELS, channelById } from "@/lib/channels";
import { formatClock } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import { latestVersion } from "../model";
import { DOUYIN_EVENT_SCHEMAS } from "../schemas";
import {
  type EventRow,
  filterEvents,
  PAGE_SIZE,
  paginateEvents,
} from "../selectors";
import {
  fetchEvents,
  openEvent,
  setFilters,
  setPage,
  startDraft,
} from "../stores/events-slice";
import { EventEditor } from "./event-editor";

const KIND_TABS = [
  { key: "all", label: "全部" },
  { key: "message", label: "消息" },
  { key: "event", label: "事件" },
] as const;

/** 新建事件：名称 + 内置模板选择（抖音四模板） */
function CreateEventForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, schemaId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [schemaId, setSchemaId] = useState(DOUYIN_EVENT_SCHEMAS[0].id);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, schemaId);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-7">
      <header className="space-y-1">
        <Badge variant="secondary" className="font-mono text-[10px]">
          抖音 · dop Webhooks
        </Badge>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          新建事件
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          从内置模板创建。ID 默认值按官方形态生成：uuid 风格 open_id、@
          开头会话串、13 位毫秒时间与十六进制 log_id。
        </p>
      </header>

      <div className="space-y-2">
        <Input
          aria-label="事件名称"
          placeholder="事件名称，如：新客问价"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {DOUYIN_EVENT_SCHEMAS.map((schema) => (
          <button
            key={schema.id}
            type="button"
            onClick={() => setSchemaId(schema.id)}
            aria-pressed={schemaId === schema.id}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              schemaId === schema.id
                ? "border-primary/40 bg-secondary text-secondary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {schema.name}
              </span>
              <Badge variant="outline" className="font-mono text-[9px]">
                {schema.kind === "message" ? "消息" : "事件"}
              </Badge>
            </span>
            <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
              {schema.eventName}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!name.trim()} onClick={create}>
          <Plus className="size-4" aria-hidden />
          创建事件
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

function LibraryRow({
  row,
  selected,
  onSelect,
}: {
  row: EventRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const latest = latestVersion(row.item);
  const channel = channelById(row.item.channelId);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors",
        selected
          ? "border-primary/30 bg-secondary text-secondary-foreground"
          : "border-transparent hover:bg-accent",
      )}
    >
      <span className="truncate text-xs font-semibold text-foreground">
        {row.item.name}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{channel?.name ?? row.item.channelId}</span>
        <span>·</span>
        <span className="truncate">
          {row.schema?.name ?? row.item.schemaId}
        </span>
        <span>·</span>
        <span>v{latest?.revision ?? 0}</span>
      </span>
      <span className="font-mono text-[9px] text-muted-foreground/70">
        {formatClock(latest?.savedAt)}
      </span>
    </button>
  );
}

/** 事件调试视图：左侧可筛选素材库（虚拟滚动 + 分页），右侧参数编辑区 */
export function EventsView() {
  const dispatch = useDispatch<AppDispatch>();
  const events = useSelector((state: RootState) => state.events);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    dispatch(fetchEvents());
    // 直发需要读取连接配置：未保存过连接时给「前往平台连接」指引
    dispatch(fetchConnections());
  }, [dispatch]);

  const rows = useMemo(
    () => filterEvents(events.items, events.filters),
    [events.items, events.filters],
  );
  const page = useMemo(
    () => paginateEvents(rows, events.page),
    [rows, events.page],
  );

  const setQuery = (query: string) => dispatch(setFilters({ query }));
  const rangeStart = page.items.length ? (page.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = (page.page - 1) * PAGE_SIZE + page.items.length;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 flex-none flex-col border-r border-border bg-muted/40">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            事件样例 <span className="font-mono">{rows.length}</span>
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-3.5" aria-hidden />
            新建
          </Button>
        </div>

        <div className="space-y-2 px-3 pb-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              aria-label="搜索事件"
              className="h-8 pl-8 text-xs"
              placeholder="搜索名称、平台或事件类型"
              value={events.filters.query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <fieldset className="flex gap-1">
            <legend className="sr-only">渠道筛选</legend>
            {(["all", ...CHANNELS.map((channel) => channel.id)] as const).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => dispatch(setFilters({ channel: id }))}
                  aria-pressed={events.filters.channel === id}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    events.filters.channel === id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {id === "all" ? "全部渠道" : channelById(id)?.name}
                </button>
              ),
            )}
          </fieldset>
          <fieldset className="flex gap-1">
            <legend className="sr-only">类型筛选</legend>
            {KIND_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => dispatch(setFilters({ kind: tab.key }))}
                aria-pressed={events.filters.kind === tab.key}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                  events.filters.kind === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-accent",
                )}
              >
                {tab.label}
              </button>
            ))}
          </fieldset>
        </div>

        {page.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <Search className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-xs font-medium text-foreground">
              没有找到匹配的素材
            </p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              换一个关键词，或清除筛选条件。
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 px-2">
            <Virtuoso
              className="h-full"
              data={page.items}
              itemContent={(_index, row) => (
                <div className="pb-1.5">
                  <LibraryRow
                    row={row}
                    selected={events.selectedId === row.item.id}
                    onSelect={() => dispatch(openEvent(row.item.id))}
                  />
                </div>
              )}
            />
          </div>
        )}

        <footer className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <span className="font-mono text-[10px] text-muted-foreground">
            {page.total === 0 ? "0" : `${rangeStart}–${rangeEnd}`} /{" "}
            {page.total}
          </span>
          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="上一页"
              disabled={page.page <= 1}
              onClick={() => dispatch(setPage(page.page - 1))}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </Button>
            <span className="min-w-14 text-center font-mono text-[10px] text-muted-foreground">
              {page.page} / {page.pages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="下一页"
              disabled={page.page >= page.pages}
              onClick={() => dispatch(setPage(page.page + 1))}
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </Button>
          </span>
        </footer>
      </aside>

      <section
        aria-label="事件编辑区"
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card"
      >
        {creating ? (
          <div className="overflow-y-auto">
            <CreateEventForm
              onCreate={(name, schemaId) => {
                dispatch(startDraft({ name, schemaId }));
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : events.draft ? (
          <EventEditor />
        ) : (
          <EmptyState
            icon={Zap}
            title="事件调试"
            description="调好一条，反复复用。从内置模板新建事件，保存进素材库后可再编辑出新版本。"
          />
        )}
      </section>
    </div>
  );
}
