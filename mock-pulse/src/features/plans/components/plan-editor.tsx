import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  GitFork,
  Info,
  ListOrdered,
  Loader2,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchEvents } from "@/features/events";
import { resolveSteps, type StepRow } from "@/features/scenarios";
import { channelById } from "@/lib/channels";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import { setView } from "@/stores/app-slice";
import type { PlanMode } from "../model";
import { planStats } from "../selectors";
import {
  addPlanLane,
  deletePlan,
  discardPlanDraft,
  type LivePlanRun,
  moveDraftLane,
  removeDraftLane,
  savePlan,
  savePlanAs,
  selectLivePlanRun,
  selectPlanRunMessage,
  selectPlanRunPhase,
  setPlanDraftFailure,
  setPlanDraftMode,
  setPlanDraftName,
  startPlanRun,
  stopWatchPlanRun,
} from "../stores/plans-slice";

const MODE_OPTIONS: { mode: PlanMode; label: string; copy: string }[] = [
  {
    mode: "parallel",
    label: "并行执行",
    copy: "所有剧本同时开始，分别执行各自的事件序列。",
  },
  {
    mode: "serial",
    label: "串行执行",
    copy: "按下方排列顺序，等待一个剧本结束，再开始下一个。",
  },
];

/** 运行实况的步骤状态展示（pending/waiting/success/failed/skipped 单点） */
const STEP_STATUS_TEXT: Record<string, string> = {
  pending: "等待",
  waiting: "发送中",
  success: "成功",
  failed: "失败",
  skipped: "未执行",
};

function stepStatusClass(status: string): string {
  switch (status) {
    case "waiting":
      return "border-primary/40 text-primary";
    case "success":
      return "border-success/40 text-success";
    case "failed":
      return "border-destructive/40 text-destructive";
    case "skipped":
      return "border-muted-foreground/30 text-muted-foreground";
    default:
      return "border-border text-muted-foreground";
  }
}

/** lane 内步骤节点：步骤名 + 序号，节点间 → 连接（lane-track） */
function LaneTrack({ rows }: { rows: StepRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-3 py-2.5 text-[10px] text-muted-foreground">
        这个剧本还没有步骤
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5">
      {rows.map((row, index) => (
        <span
          key={`${row.step.eventId}-${row.index}`}
          className="flex items-center gap-1.5"
        >
          {index > 0 ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              →
            </span>
          ) : null}
          <span className="rounded-md border border-border bg-background px-2 py-1">
            <span className="block text-[11px] font-medium text-foreground">
              {row.event?.name ?? row.step.eventId}
            </span>
            <span className="block font-mono text-[9px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

/** 运行实况：每 lane 每步 waiting/success/failed/skipped（run-progress 事件驱动） */
function PlanLiveRun({ live }: { live: LivePlanRun }) {
  // lane/步骤按位置标识（同一剧本可重复入编排，位置即键语义）
  const laneEntries = live.lanes.map((lane, laneIndex) => ({
    id: `${laneIndex}-${lane.scenarioName}`,
    lane,
    laneIndex,
    stepEntries: lane.steps.map((step, index) => ({
      id: `${index + 1}-${step.eventName}`,
      step,
      index,
    })),
  }));
  return (
    <section aria-label="编排运行实况" className="space-y-2">
      <h3 className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
        本次运行 · {live.mode === "parallel" ? "并行" : "串行"} ·{" "}
        {formatDateTime(live.startedAt)}
      </h3>
      {laneEntries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg border border-primary/30 bg-primary/5"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(entry.laneIndex + 1).padStart(2, "0")}
            </span>
            <span className="truncate text-xs font-semibold text-foreground">
              {entry.lane.scenarioName}
            </span>
            {live.mode === "serial" && entry.laneIndex > 0 ? (
              <span className="font-mono text-[9px] text-muted-foreground">
                等待前一剧本结束
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-primary/20 px-3 py-2">
            {entry.stepEntries.map((stepEntry) => (
              <span
                key={stepEntry.id}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px]",
                  stepStatusClass(stepEntry.step.status),
                )}
              >
                {`${stepEntry.index + 1} ${stepEntry.step.eventName}`}
                {stepEntry.step.status === "waiting" ? (
                  <Loader2 className="size-2.5 animate-spin" aria-hidden />
                ) : null}
                {stepEntry.step.status === "success" ? (
                  <CheckCircle2 className="size-2.5" aria-hidden />
                ) : null}
                {` · ${STEP_STATUS_TEXT[stepEntry.step.status]}`}
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** 添加已保存剧本：跨渠道可选（弹层列表仿剧本添加事件的 picker 模式） */
function AddScenarioPicker({
  scenarios,
  onPick,
  onCancel,
}: {
  scenarios: {
    id: string;
    name: string;
    channelId: string;
    stepCount: number;
  }[];
  onPick: (scenarioId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    const text = query.trim().toLowerCase();
    return scenarios.filter(
      (scenario) =>
        text === "" ||
        scenario.name.toLowerCase().includes(text) ||
        (channelById(scenario.channelId)?.name ?? scenario.channelId).includes(
          query.trim(),
        ),
    );
  }, [scenarios, query]);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="搜索已保存剧本"
          className="h-8 text-xs"
          placeholder="搜索剧本名称或渠道"
          value={query}
          onChange={(change) => setQuery(change.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
      {candidates.length === 0 ? (
        <p className="py-2 text-center text-[10px] leading-relaxed text-muted-foreground">
          还没有可用的已保存剧本。先到「平台剧本」保存剧本，再回到这里添加。
        </p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {candidates.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onPick(scenario.id)}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <Badge variant="secondary" className="font-mono text-[9px]">
                {channelById(scenario.channelId)?.name ?? scenario.channelId}
              </Badge>
              <span className="truncate text-xs text-foreground">
                {scenario.name}
              </span>
              <span className="grow" />
              <span className="font-mono text-[9px] text-muted-foreground">
                {scenario.stepCount} 步
              </span>
              <Plus className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 编排编辑器：执行模式 + 失败策略 + lanes（跨渠道剧本引用）+ 运行实况 */
export function PlanEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const draft = useSelector((state: RootState) => state.plans.draft);
  const items = useSelector((state: RootState) => state.plans.items);
  const scenarios = useSelector((state: RootState) => state.scenarios.items);
  const events = useSelector((state: RootState) => state.events.items);
  const eventsLoaded = useSelector((state: RootState) => state.events.loaded);
  const runPhase = useSelector((state: RootState) =>
    selectPlanRunPhase(state.plans),
  );
  const runMessage = useSelector((state: RootState) =>
    selectPlanRunMessage(state.plans),
  );
  const liveRun = useSelector((state: RootState) =>
    selectLivePlanRun(state.plans),
  );
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");

  const saved = useMemo(
    () => (draft ? (items.find((item) => item.id === draft.id) ?? null) : null),
    [items, draft],
  );
  const dirty = useMemo(() => {
    if (!draft) return false;
    if (!saved) return true;
    return (
      saved.name !== draft.name ||
      saved.mode !== draft.mode ||
      saved.failure !== draft.failure ||
      JSON.stringify(saved.items) !== JSON.stringify(draft.items)
    );
  }, [draft, saved]);

  useEffect(() => {
    // lane 步骤名解析依赖事件库；未装载时补拉
    if (draft && draft.items.length > 0 && !eventsLoaded) {
      void dispatch(fetchEvents());
    }
  }, [draft, eventsLoaded, dispatch]);

  // 每个 lane 的步骤展示行（引用解析：剧本缺失防御显示）
  const laneRows = useMemo(() => {
    if (!draft) return [];
    return draft.items.map((item, index) => {
      const scenario = scenarios.find(
        (candidate) => candidate.id === item.scenarioId,
      );
      return {
        index,
        scenarioId: item.scenarioId,
        scenario,
        rows: scenario ? resolveSteps(scenario.steps, events) : [],
      };
    });
  }, [draft, scenarios, events]);

  const stats = useMemo(
    () =>
      draft ? planStats(draft, scenarios) : { platformCount: 0, eventCount: 0 },
    [draft, scenarios],
  );

  if (!draft) return null;

  const laneCount = draft.items.length;
  const running = runPhase === "starting" || runPhase === "running";

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败。");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border px-6 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label="编排名称"
            className="h-9 w-72 border-transparent bg-transparent px-0 font-heading text-lg font-semibold shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2"
            value={draft.name}
            onChange={(change) =>
              dispatch(setPlanDraftName(change.target.value))
            }
          />
          <span className="grow" />
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={() =>
              void runAction(async () => {
                setSaving(true);
                try {
                  await dispatch(savePlan()).unwrap();
                } finally {
                  setSaving(false);
                }
              })
            }
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            保存编排
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            title="以新副本保存当前编排"
            onClick={() =>
              void runAction(async () => {
                setSaving(true);
                try {
                  await dispatch(savePlanAs()).unwrap();
                } finally {
                  setSaving(false);
                }
              })
            }
          >
            <Copy className="size-3.5" aria-hidden />
            另存为
          </Button>
          {/* 运行中变为「停止运行」：后台执行不可中断，点击仅停止实况视图；
              完整记录完成后仍写入运行记录 */}
          {running ? (
            <Button
              variant="destructive"
              size="sm"
              title="后台执行不可中断：停止后结果仍会写入运行记录"
              onClick={() => dispatch(stopWatchPlanRun())}
            >
              <Square className="size-3.5" aria-hidden />
              停止运行
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={laneCount === 0}
              title={laneCount === 0 ? "先添加已保存剧本再运行" : undefined}
              onClick={() =>
                void runAction(() => dispatch(startPlanRun()).unwrap())
              }
            >
              <Play className="size-4" aria-hidden />
              运行编排
            </Button>
          )}
          {saved ? (
            confirmDelete ? (
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmDelete(false);
                    void dispatch(deletePlan(draft.id));
                  }}
                >
                  确认删除
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                删除
              </Button>
            )
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch(discardPlanDraft())}
            >
              放弃草稿
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{laneCount} 条剧本</span>
          {dirty ? (
            <span className="flex items-center gap-1 text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              有未保存的修改
            </span>
          ) : saved ? (
            <span>· 已保存</span>
          ) : (
            <span>· 尚未进入编排库</span>
          )}
        </div>
        {actionError ? (
          <p role="alert" className="text-[10px] text-destructive">
            {actionError}
          </p>
        ) : null}
        {runPhase === "error" ? (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-[10px] text-destructive"
          >
            <XCircle className="size-3.5 shrink-0" aria-hidden />
            {runMessage}
          </p>
        ) : null}
        {runPhase === "needConnection" ? (
          <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            尚未配置编排涉及渠道的连接：编排运行需要目标地址与签名密钥。
            <Button
              variant="secondary"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => dispatch(setView("connections"))}
            >
              前往平台连接
            </Button>
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <span className="text-xs font-semibold text-foreground">
            执行计划{" "}
            <span className="font-mono text-muted-foreground">{laneCount}</span>
          </span>
          <span className="grow" />
          <span className="text-[10px] text-muted-foreground">
            每个剧本内部仍按顺序执行
          </span>
        </div>

        {/* 执行方式切换 + 说明（原型 mode-switch） */}
        <div className="space-y-2">
          <fieldset className="flex gap-1">
            <legend className="sr-only">执行模式</legend>
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                aria-pressed={draft.mode === option.mode}
                onClick={() => dispatch(setPlanDraftMode(option.mode))}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  draft.mode === option.mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {option.mode === "parallel" ? (
                  <GitFork className="size-3.5" aria-hidden />
                ) : (
                  <ListOrdered className="size-3.5" aria-hidden />
                )}
                {option.label}
              </button>
            ))}
          </fieldset>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {MODE_OPTIONS.find((option) => option.mode === draft.mode)?.copy}
          </p>
          {draft.mode === "parallel" && laneCount > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-secondary px-2 py-1 font-mono text-[10px] text-primary">
              T + 0 同时起跑
            </p>
          ) : null}
        </div>

        {/* lanes：序号 / 渠道 / 剧本名 / 步数 + 调序移除 + 步骤轨道 */}
        <div className="space-y-3">
          {laneRows.map(({ index, scenario, rows, scenarioId }) => (
            <div key={`${scenarioId}-${index}`} className="space-y-1.5">
              {draft.mode === "serial" && index > 0 ? (
                <p className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                  <ChevronDown className="size-3" aria-hidden />
                  上一剧本结束后开始
                </p>
              ) : null}
              <article className="rounded-lg border border-border bg-background">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {scenario ? (
                    <Badge variant="secondary" className="font-mono text-[9px]">
                      {channelById(scenario.channelId)?.name ??
                        scenario.channelId}
                    </Badge>
                  ) : (
                    <Badge
                      variant="destructive"
                      className="font-mono text-[9px]"
                    >
                      剧本已不在剧本库
                    </Badge>
                  )}
                  <div className="min-w-0 grow">
                    <h3 className="truncate text-xs font-semibold text-foreground">
                      {scenario?.name ?? scenarioId}
                    </h3>
                    <p className="font-mono text-[9px] text-muted-foreground">
                      {scenario ? `${scenario.steps.length} 步` : "引用失效"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`剧本 ${index + 1} 上移`}
                    disabled={index === 0}
                    onClick={() =>
                      dispatch(moveDraftLane({ index, delta: -1 }))
                    }
                  >
                    <ChevronUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`剧本 ${index + 1} 下移`}
                    disabled={index === laneCount - 1}
                    onClick={() => dispatch(moveDraftLane({ index, delta: 1 }))}
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={`从编排中移除剧本 ${index + 1}`}
                    onClick={() => dispatch(removeDraftLane(index))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <div className="border-t border-border">
                  <LaneTrack rows={rows} />
                </div>
              </article>
            </div>
          ))}
        </div>

        {adding ? (
          <AddScenarioPicker
            scenarios={scenarios.map((scenario) => ({
              id: scenario.id,
              name: scenario.name,
              channelId: scenario.channelId,
              stepCount: scenario.steps.length,
            }))}
            onCancel={() => setAdding(false)}
            onPick={(scenarioId) =>
              void runAction(async () => {
                await dispatch(addPlanLane({ scenarioId })).unwrap();
                setAdding(false);
              })
            }
          />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full border border-dashed"
          >
            <Plus className="size-3.5" aria-hidden />
            添加已保存剧本
          </Button>
        )}

        {/* 失败策略 + 统计（原型 builder-bottom） */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="text-[11px] text-foreground">剧本失败时</span>
          <select
            aria-label="编排失败处理"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={draft.failure}
            onChange={(change) =>
              dispatch(
                setPlanDraftFailure(change.target.value as "stop" | "continue"),
              )
            }
          >
            <option value="continue">继续其他剧本</option>
            <option value="stop">停止整个编排</option>
          </select>
          <span className="grow" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {stats.platformCount} 个平台 · {stats.eventCount} 个事件
          </span>
        </div>

        {liveRun ? <PlanLiveRun live={liveRun} /> : null}
      </div>

      <footer className="flex flex-none items-center gap-2 border-t border-border px-6 py-2 text-[10px] text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden />
        运行使用启动时的快照，后续编辑不影响正在执行的任务
      </footer>
    </div>
  );
}
