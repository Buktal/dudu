import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ChannelPicker } from "@/components/channel-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type EventItem, fetchEvents } from "@/features/events";
import { channelById } from "@/lib/channels";
import type { AppDispatch, RootState } from "@/store";
import type { Scenario } from "../model";
import { resolveSteps, type StepRow } from "../selectors";
import {
  addScenarioStep,
  deleteScenario,
  discardScenarioDraft,
  moveDraftStep,
  removeDraftStep,
  saveScenario,
  setDraftChannel,
  setDraftName,
  syncAllScenarioSteps,
  syncScenarioStep,
} from "../stores/scenarios-slice";

/** 步骤卡：序号 / 事件名 / 发的内容（引用版本解析）/ 期待的回执 + 调序删除同步 */
function StepCard({
  row,
  first,
  last,
  onAction,
}: {
  row: StepRow;
  first: boolean;
  last: boolean;
  onAction: (action: () => Promise<unknown>) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const { step, referenced, event } = row;
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-background p-3">
      <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
        {String(row.index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-foreground">
            {event?.name ?? step.eventId}
          </span>
          <span className="grow" />
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`步骤 ${row.index + 1} 上移`}
            disabled={first}
            onClick={() =>
              dispatch(moveDraftStep({ index: row.index, delta: -1 }))
            }
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`步骤 ${row.index + 1} 下移`}
            disabled={last}
            onClick={() =>
              dispatch(moveDraftStep({ index: row.index, delta: 1 }))
            }
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={`移除步骤 ${row.index + 1}`}
            onClick={() => dispatch(removeDraftStep(row.index))}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span>已引用 v{step.revision}</span>
          {row.missing ? (
            <Badge
              variant="destructive"
              className="h-4 px-1 font-mono text-[8px]"
            >
              事件已不在素材库
            </Badge>
          ) : row.outdated ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-primary"
              aria-label={`步骤 ${row.index + 1} 同步到最新版本`}
              onClick={() =>
                onAction(() =>
                  dispatch(syncScenarioStep({ index: row.index })).unwrap(),
                )
              }
            >
              <RefreshCw className="size-3" aria-hidden />
              有新版本 v{row.latestRevision} · 同步
            </Button>
          ) : null}
        </div>
        <pre className="max-h-16 overflow-hidden rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground">
          {referenced
            ? JSON.stringify(referenced.payload)
            : "（引用版本不可解析）"}
        </pre>
        <p className="font-mono text-[9px] text-muted-foreground">
          期待的回执 · HTTP {referenced?.expected.status ?? "-"}
        </p>
      </div>
    </div>
  );
}

/** 加号添加：只列同渠道已保存事件（渠道锁定的 UI 侧呈现；领域层兜底校验） */
function AddStepPicker({
  channelId,
  events,
  onPick,
  onCancel,
}: {
  channelId: Scenario["channelId"];
  events: EventItem[];
  onPick: (eventId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    const text = query.trim().toLowerCase();
    return events
      .filter(
        (event) => event.channelId === channelId && event.versions.length > 0,
      )
      .filter(
        (event) => text === "" || event.name.toLowerCase().includes(text),
      );
  }, [events, channelId, query]);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`搜索${channelById(channelId)?.name ?? channelId}事件`}
          className="h-8 text-xs"
          placeholder="搜索本渠道已保存事件"
          value={query}
          onChange={(change) => setQuery(change.target.value)}
        />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
      {candidates.length === 0 ? (
        <p className="py-2 text-center text-[10px] leading-relaxed text-muted-foreground">
          还没有可用的已保存事件。先到「事件调试」保存
          {channelById(channelId)?.name ?? channelId}
          事件，再回到这里添加。
        </p>
      ) : (
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {candidates.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onPick(event.id)}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <span className="truncate text-xs text-foreground">
                {event.name}
              </span>
              <span className="grow" />
              <span className="font-mono text-[9px] text-muted-foreground">
                v{event.versions[event.versions.length - 1]?.revision}
              </span>
              <Plus className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 剧本编辑器：渠道锁定 + 步骤引用版本 + 显式同步（ADR-0004） */
export function ScenarioEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const draft = useSelector((state: RootState) => state.scenarios.draft);
  const items = useSelector((state: RootState) => state.scenarios.items);
  const events = useSelector((state: RootState) => state.events.items);
  const eventsLoaded = useSelector((state: RootState) => state.events.loaded);
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
      saved.channelId !== draft.channelId ||
      JSON.stringify(saved.steps) !== JSON.stringify(draft.steps)
    );
  }, [draft, saved]);

  useEffect(() => {
    // 事件库未装载时补拉：版本提示与添加选择器都依赖事件版本
    if (draft && !eventsLoaded) void dispatch(fetchEvents());
  }, [draft, eventsLoaded, dispatch]);

  const rows = useMemo(
    () => resolveSteps(draft?.steps ?? [], events),
    [draft, events],
  );
  const channel = draft ? channelById(draft.channelId) : undefined;
  const locked = Boolean(draft && draft.steps.length > 0);
  const anyOutdated = rows.some((row) => row.outdated);
  if (!draft) return null;

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
            aria-label="剧本名称"
            className="h-9 w-72 border-transparent bg-transparent px-0 font-heading text-lg font-semibold shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2"
            value={draft.name}
            onChange={(change) => dispatch(setDraftName(change.target.value))}
          />
          <span className="grow" />
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={() =>
              void runAction(async () => {
                setSaving(true);
                try {
                  await dispatch(saveScenario()).unwrap();
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
            保存剧本
          </Button>
          {/* 剧本整体运行归 #20；先给入口占位 */}
          <Button size="sm" disabled title="剧本运行将在后续版本落地">
            <Play className="size-4" aria-hidden />
            运行剧本
          </Button>
          {saved ? (
            confirmDelete ? (
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmDelete(false);
                    void dispatch(deleteScenario(draft.id));
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
              onClick={() => dispatch(discardScenarioDraft())}
            >
              放弃草稿
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="secondary" className="font-mono text-[9px]">
            {channel?.name ?? draft.channelId}
          </Badge>
          {locked ? (
            <Badge variant="outline" className="gap-1 font-mono text-[9px]">
              <Lock className="size-2.5" aria-hidden />
              平台已锁定
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[9px]">
              等待添加首步 · 渠道可换
            </Badge>
          )}
          <span className="font-mono">{draft.steps.length} 步</span>
          {dirty ? (
            <span className="flex items-center gap-1 text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              有未保存的修改
            </span>
          ) : saved ? (
            <span>· 已保存</span>
          ) : (
            <span>· 尚未进入剧本库</span>
          )}
        </div>
        {actionError ? (
          <p role="alert" className="text-[10px] text-destructive">
            {actionError}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            只能添加{channel?.name ?? draft.channelId}
            的已保存事件；每个步骤保留选入时引用的版本，事件出新版本后可显式同步。
          </p>
          <span className="grow" />
          {anyOutdated ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void runAction(() => dispatch(syncAllScenarioSteps()).unwrap())
              }
            >
              <RefreshCw className="size-3.5" aria-hidden />
              全部同步到最新版本
            </Button>
          ) : null}
        </div>

        {!locked ? (
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">剧本渠道（添加首步后锁定）</legend>
            <span className="mr-1 font-mono text-[9px] text-muted-foreground">
              渠道
            </span>
            <ChannelPicker
              value={draft.channelId}
              onSelect={(channel) => dispatch(setDraftChannel(channel))}
            />
          </fieldset>
        ) : null}

        <div className="space-y-2">
          {rows.map((row) => (
            <StepCard
              key={`${row.step.eventId}-${row.index}`}
              row={row}
              first={row.index === 0}
              last={row.index === rows.length - 1}
              onAction={runAction}
            />
          ))}
        </div>

        {adding ? (
          <AddStepPicker
            channelId={draft.channelId}
            events={events}
            onCancel={() => setAdding(false)}
            onPick={(eventId) =>
              void runAction(async () => {
                await dispatch(addScenarioStep({ eventId })).unwrap();
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
            添加已保存事件
          </Button>
        )}
      </div>

      <footer className="flex flex-none items-center gap-2 border-t border-border px-6 py-2 text-[10px] text-muted-foreground">
        步骤从已保存事件组装，编辑来源事件后可主动同步版本。
      </footer>
    </div>
  );
}
