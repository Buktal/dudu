import {
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Virtuoso } from "react-virtuoso";
import { ChannelPicker } from "@/components/channel-picker";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchEvents } from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import type { ScenarioRow } from "../selectors";
import { filterScenarios, PAGE_SIZE, paginateScenarios } from "../selectors";
import {
  fetchScenarios,
  openScenario,
  setFilters,
  setPage,
  startScenarioDraft,
} from "../stores/scenarios-slice";
import { ScenarioEditor } from "./scenario-editor";

/** 新建剧本：先选渠道（添加第一步后渠道锁定） */
function CreateScenarioForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, channelId: ChannelId) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState<ChannelId>("douyin");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, channelId);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-7">
      <header className="space-y-1">
        <Badge variant="secondary" className="font-mono text-[10px]">
          每平台独立剧本 · 禁跨平台混写
        </Badge>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          新建剧本
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          先选渠道。添加第一步后，渠道锁定，只能继续添加该渠道的已保存事件；
          想穿插多渠道就建多个剧本并行（执行编排，后续版本）。
        </p>
      </header>

      <div className="space-y-2">
        <Input
          aria-label="剧本名称"
          placeholder="剧本名称，如：从进入会话到商品咨询"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="font-mono text-[10px] text-muted-foreground">
          所属渠道
        </legend>
        <ChannelPicker
          variant="cards"
          value={channelId}
          onSelect={setChannelId}
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!name.trim()} onClick={create}>
          <Plus className="size-4" aria-hidden />
          创建剧本
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
  row: ScenarioRow;
  selected: boolean;
  onSelect: () => void;
}) {
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
        {row.scenario.name}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{row.channelName}</span>
        <span>·</span>
        <span>{row.stepCount} 步</span>
      </span>
    </button>
  );
}

/** 平台剧本视图：左侧剧本库（筛选分页），右侧步骤编排编辑区 */
export function ScenariosView() {
  const dispatch = useDispatch<AppDispatch>();
  const scenarios = useSelector((state: RootState) => state.scenarios);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    dispatch(fetchScenarios());
    // 步骤引用解析与添加选择器依赖事件版本，一并装载
    dispatch(fetchEvents());
  }, [dispatch]);

  const rows = useMemo(
    () => filterScenarios(scenarios.items, scenarios.filters),
    [scenarios.items, scenarios.filters],
  );
  const page = useMemo(
    () => paginateScenarios(rows, scenarios.page),
    [rows, scenarios.page],
  );

  const rangeStart = page.items.length ? (page.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = (page.page - 1) * PAGE_SIZE + page.items.length;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 flex-none flex-col border-r border-border bg-muted/40">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            已保存剧本 <span className="font-mono">{rows.length}</span>
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
              aria-label="搜索剧本"
              className="h-8 pl-8 text-xs"
              placeholder="搜索名称或渠道"
              value={scenarios.filters.query}
              onChange={(event) =>
                dispatch(setFilters({ query: event.target.value }))
              }
            />
          </div>
          <fieldset>
            <legend className="sr-only">渠道筛选</legend>
            <ChannelPicker
              allowAll
              value={scenarios.filters.channel}
              onSelect={(channel) => dispatch(setFilters({ channel }))}
            />
          </fieldset>
        </div>

        {page.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <Search className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-xs font-medium text-foreground">
              {scenarios.loaded ? "没有找到匹配的剧本" : "剧本库还没有内容"}
            </p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {scenarios.loaded
                ? "换一个关键词，或清除筛选条件。"
                : "新建剧本，把同渠道事件按顺序串起来。"}
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
                    selected={scenarios.selectedId === row.scenario.id}
                    onSelect={() => dispatch(openScenario(row.scenario.id))}
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
        aria-label="剧本编辑区"
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card"
      >
        {creating ? (
          <div className="overflow-y-auto">
            <CreateScenarioForm
              onCreate={(name, channelId) => {
                dispatch(startScenarioDraft({ name, channelId }));
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : scenarios.draft ? (
          <ScenarioEditor />
        ) : (
          <EmptyState
            icon={ListVideo}
            title="平台剧本"
            description="同平台的事件，按顺序串起来。新建剧本先选渠道，添加第一步后渠道锁定。"
          />
        )}
      </section>
    </div>
  );
}
