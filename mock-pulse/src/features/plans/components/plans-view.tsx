import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Star,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Virtuoso } from "react-virtuoso";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchScenarios } from "@/features/scenarios";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import type { PlanRow } from "../selectors";
import { filterPlans, PAGE_SIZE, paginatePlans } from "../selectors";
import {
  fetchPlans,
  openPlan,
  setFilters,
  setPage,
  startPlanDraft,
  togglePlanFavorite,
} from "../stores/plans-slice";
import { PlanEditor } from "./plan-editor";

/** 新建编排：名称 + 执行方式（跨渠道，从已保存剧本开始） */
function CreatePlanForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, mode: "parallel" | "serial") => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"parallel" | "serial">("parallel");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, mode);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-7">
      <header className="space-y-1">
        <p className="font-mono text-[10px] text-muted-foreground">
          跨剧本执行计划 · 允许跨渠道
        </p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          新建编排
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          从已保存剧本开始，选择串行或并行执行。之后在编辑器里添加剧本、
          设定失败策略。
        </p>
      </header>

      <div className="space-y-2">
        <Input
          aria-label="编排名称"
          placeholder="编排名称，如：双平台完整回归"
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
          执行方式
        </legend>
        <select
          aria-label="执行方式"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as "parallel" | "serial")
          }
        >
          <option value="parallel">并行执行</option>
          <option value="serial">串行执行</option>
        </select>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!name.trim()} onClick={create}>
          <Plus className="size-4" aria-hidden />
          开始编辑
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

/** 库行：名称 + 「N 个剧本 · 并行/串行」meta + 收藏星标 */
function LibraryRow({
  row,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  row: PlanRow;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-1 rounded-lg border p-2.5 transition-colors",
        selected
          ? "border-primary/30 bg-secondary text-secondary-foreground"
          : "border-transparent hover:bg-accent",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-xs font-semibold text-foreground">
          {row.plan.name}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span>{row.scenarioCount} 个剧本</span>
          <span>·</span>
          <span>{row.modeLabel}</span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 flex-none"
        aria-label={row.plan.favorite ? "取消收藏" : "收藏此编排"}
        aria-pressed={row.plan.favorite}
        onClick={onToggleFavorite}
      >
        <Star
          className={cn(
            "size-3.5",
            row.plan.favorite
              ? "fill-primary text-primary"
              : "text-muted-foreground",
          )}
          aria-hidden
        />
      </Button>
    </div>
  );
}

const KIND_TABS: { key: "all" | "favorite"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "favorite", label: "收藏" },
];

/** 执行编排视图：左侧编排库（搜索/收藏筛选分页），右侧编排编辑器 */
export function PlansView() {
  const dispatch = useDispatch<AppDispatch>();
  const plans = useSelector((state: RootState) => state.plans);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    dispatch(fetchPlans());
    // lane 解析与添加选择器依赖剧本库，一并装载
    dispatch(fetchScenarios());
  }, [dispatch]);

  const rows = useMemo(
    () => filterPlans(plans.items, plans.filters),
    [plans.items, plans.filters],
  );
  const page = useMemo(
    () => paginatePlans(rows, plans.page),
    [rows, plans.page],
  );

  const rangeStart = page.items.length ? (page.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = (page.page - 1) * PAGE_SIZE + page.items.length;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 flex-none flex-col border-r border-border bg-muted/40">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <p className="text-[10px] font-medium text-muted-foreground">
            已保存编排 <span className="font-mono">{rows.length}</span>
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
              aria-label="搜索编排"
              className="h-8 pl-8 text-xs"
              placeholder="搜索名称"
              value={plans.filters.query}
              onChange={(event) =>
                dispatch(setFilters({ query: event.target.value }))
              }
            />
          </div>
          <fieldset className="flex gap-1">
            <legend className="sr-only">编排筛选</legend>
            {KIND_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={plans.filters.kind === tab.key}
                onClick={() => dispatch(setFilters({ kind: tab.key }))}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                  plans.filters.kind === tab.key
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
              {plans.loaded ? "没有找到匹配的编排" : "编排库还没有内容"}
            </p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {plans.loaded
                ? "换一个关键词，或清除筛选条件。"
                : "新建编排，把多个已保存剧本一起或依次运行。"}
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
                    selected={plans.selectedId === row.plan.id}
                    onSelect={() => dispatch(openPlan(row.plan.id))}
                    onToggleFavorite={() =>
                      dispatch(togglePlanFavorite(row.plan.id))
                    }
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
        aria-label="编排编辑区"
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card"
      >
        {creating ? (
          <div className="overflow-y-auto">
            <CreatePlanForm
              onCreate={(name, mode) => {
                dispatch(startPlanDraft({ name, mode }));
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        ) : plans.draft ? (
          <PlanEditor />
        ) : (
          <EmptyState
            icon={Workflow}
            title="执行编排"
            description="让多个剧本一起跑，或依次跑。新建编排选择多个已保存剧本（允许跨渠道），设定串行或并行与失败策略。"
          />
        )}
      </section>
    </div>
  );
}
