import { Fragment, useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { IconButton } from "@/components/icon-button";
import { MaterialPicker } from "@/components/material-picker";
import { Notice } from "@/components/notice";
import { StudioIcon } from "@/components/studio-icon";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isRunBusy,
  isStoppingRun,
  liveLanes,
  RunLanes,
  RunPersistenceNotice,
  RunSummary,
  recordLanes,
  selectRun,
  stopRun,
} from "@/features/runs";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { setView } from "@/stores/app-slice";
import { type PlanMode, resolveLaneScenario, scenarioById } from "../model";
import {
  addPlanLane,
  savePlan,
  savePlanAs,
  syncPlanLane,
} from "../stores/plan-library";
import { selectPlanLiveRun, startPlanRun } from "../stores/plan-run";
import * as actions from "../stores/plans-slice";

export function PlanEditor() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.plans);
  const scenarios = useAppSelector((root) => root.scenarios.items);
  const events = useAppSelector((root) => root.events.items);
  const runs = useAppSelector((root) => root.runs);
  // 任一运行（直发/剧本/编排）进行中即 busy——运行会话统一口径
  const busy = useAppSelector((root) => isRunBusy(root));
  const [picker, setPicker] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = state.draft;
  if (!draft) return null;
  const saved = state.items.find((item) => item.id === draft.id);
  const dirty = actions.selectPlanDirty(state);
  const laneScenarios = draft.items.map((item) =>
    resolveLaneScenario(item, scenarios),
  );
  // 编排实况本体在 runs 域，这里按编排 id 派生（见 plan-run.ts）
  const active = selectPlanLiveRun({ runs }, draft.id);
  const last = [...runs.items]
    .reverse()
    .find((run) => run.source === "plan" && run.sourceId === draft.id);
  const runLanes = active ? liveLanes(active) : last ? recordLanes(last) : [];
  const perform = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <>
      <EntityHeader
        label="编排"
        name={draft.name}
        kicker="跨剧本执行计划"
        icon={<StudioIcon name="plan" />}
        onNameChange={(name) => dispatch(actions.setPlanDraftName(name))}
        dirty={dirty}
        saved={!!saved}
        favorite={draft.favorite}
        onFavorite={() => dispatch(actions.toggleDraftFavorite())}
        actions={
          <>
            <Button variant="ghost" onClick={() => setCopying(true)}>
              另存为
            </Button>
            <Button
              variant={dirty ? "secondary" : "outline"}
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void perform(() => dispatch(savePlan()).unwrap()).finally(() =>
                  setSaving(false),
                );
              }}
            >
              <StudioIcon name="save" data-icon="inline-start" />
              保存编排
            </Button>
            <Button
              variant={active ? "destructive" : "default"}
              disabled={active ? isStoppingRun(runs, active.runId) : busy}
              onClick={() =>
                void perform(() =>
                  active
                    ? dispatch(stopRun(active.runId)).unwrap()
                    : dispatch(startPlanRun()).unwrap(),
                )
              }
            >
              <StudioIcon
                name={active ? "stop" : "play"}
                data-icon="inline-start"
              />
              {active && isStoppingRun(runs, active.runId)
                ? "正在停止…"
                : active
                  ? "停止运行"
                  : "运行编排"}
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 lg:px-6">
        <span className="flex items-center gap-2">
          执行计划{" "}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {draft.items.length}
          </span>
        </span>
        <span className="min-w-0 flex-1" />
        <span className="text-xs text-muted-foreground">
          每个剧本内部仍按顺序执行
        </span>
      </div>
      {error || state.planRunPhase === "error" ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error || state.planRunMessage}
        </Notice>
      ) : null}
      {state.planRunPhase === "needConnection" ? (
        <Notice className="mb-4">
          <StudioIcon name="info" />
          <span>
            请先配置
            {state.needConnectionChannels
              .map((id) => channelById(id)?.name)
              .join("、")}
            的连接。
          </span>
          <Button
            size="sm"
            onClick={() => dispatch(setView("connections"))}
            variant="outline"
          >
            前往平台连接
          </Button>
        </Notice>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        <RunPersistenceNotice runId={last?.id} />
        {runLanes.length ? (
          <RunSummary
            lanes={runLanes}
            mode={active?.mode ?? last?.mode ?? draft.mode}
            active={!!active}
            onStop={() =>
              active &&
              void perform(() => dispatch(stopRun(active.runId)).unwrap())
            }
            onOpen={() => {
              if (last) dispatch(selectRun(last.id));
              dispatch(setView("runs"));
            }}
          />
        ) : null}
        <ToggleGroup
          className="w-fit"
          value={[draft.mode]}
          onValueChange={(values) => {
            if (values[0])
              dispatch(actions.setPlanDraftMode(values[0] as PlanMode));
          }}
          aria-label="执行模式"
        >
          <ToggleGroupItem
            className={cn("", draft.mode === "parallel" && "")}
            value="parallel"
          >
            <StudioIcon name="parallel" />
            并行执行
          </ToggleGroupItem>
          <ToggleGroupItem
            className={cn("", draft.mode === "serial" && "")}
            value="serial"
          >
            <StudioIcon name="serial" />
            串行执行
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">
          {draft.mode === "parallel"
            ? "所有剧本同时开始，分别执行各自的事件序列。"
            : "按下方排列顺序，等待一个剧本结束，再开始下一个。"}
        </p>
        {draft.mode === "parallel" && draft.items.length ? (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            T + 0 <span>同时起跑</span>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-3">
          {draft.items.map((item, index) => {
            const scene = laneScenarios[index];
            // 过期比对必须看库内当前版本（不能拿快照自比），走库内查找。
            const current = scenarioById(scenarios, item.scenarioId);
            const outdated =
              scene &&
              current &&
              (current.revision ?? 1) > (scene.revision ?? 1);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 编排允许重复剧本；轨道按模型中的位置标识，没有局部组件状态。
              <Fragment key={`${index}-${item.scenarioId}`}>
                {draft.mode === "serial" && index > 0 ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <StudioIcon name="down" />
                    上一剧本结束后开始
                  </div>
                ) : null}
                <article className="min-w-0 rounded-xl border bg-card p-4">
                  <header className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {scene ? (
                      <ChannelMark channel={scene.channelId} />
                    ) : (
                      <StudioIcon name="info" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3>{scene?.name ?? "来源剧本不存在"}</h3>
                      <p>
                        {scene
                          ? `${channelById(scene.channelId)?.name} · ${scene.steps.length} 步 · v${scene.revision ?? 1}`
                          : "请移除后重新选择"}
                        {outdated ? (
                          <Button
                            type="button"
                            className="h-auto p-0 text-xs text-muted-foreground"
                            onClick={() =>
                              void perform(() =>
                                dispatch(syncPlanLane(index)).unwrap(),
                              )
                            }
                            variant="link"
                          >
                            有新版本 · 同步
                          </Button>
                        ) : null}
                      </p>
                    </div>
                    <IconButton
                      label="剧本上移"
                      disabled={index === 0}
                      onClick={() =>
                        dispatch(actions.moveDraftLane({ index, delta: -1 }))
                      }
                    >
                      <StudioIcon name="up" />
                    </IconButton>
                    <IconButton
                      label="剧本下移"
                      disabled={index === draft.items.length - 1}
                      onClick={() =>
                        dispatch(actions.moveDraftLane({ index, delta: 1 }))
                      }
                    >
                      <StudioIcon name="down" />
                    </IconButton>
                    <IconButton
                      label="从编排中移除剧本"
                      onClick={() => dispatch(actions.removeDraftLane(index))}
                    >
                      <StudioIcon name="x" />
                    </IconButton>
                  </header>
                  <div className="flex min-w-0 items-center gap-3 overflow-x-auto pb-2">
                    {scene?.steps.length ? (
                      scene.steps.map((step, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 这是固定剧本快照，同一事件可以出现多次，步骤位置是快照标识。
                        <Fragment key={`${i}-${step.eventId}`}>
                          {i ? (
                            <span className="shrink-0 text-muted-foreground">
                              →
                            </span>
                          ) : null}
                          <div className="min-w-28 shrink-0 rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                            {events.find((event) => event.id === step.eventId)
                              ?.name ?? "来源事件不存在"}
                            <small>
                              {String(i + 1).padStart(2, "0")} ·{" "}
                              {step.wait ? `等待 ${step.wait}s` : "立即发送"}
                            </small>
                          </div>
                        </Fragment>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        这个剧本还没有步骤
                      </span>
                    )}
                  </div>
                </article>
              </Fragment>
            );
          })}
        </div>
        <Button
          type="button"
          className="my-4 w-full "
          onClick={() => setPicker(true)}
          variant="outline"
        >
          <StudioIcon name="plus" />
          添加已保存剧本
        </Button>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>剧本失败时</span>
          <NativeSelect
            aria-label="编排失败处理"
            value={draft.failure}
            onChange={(event) =>
              dispatch(
                actions.setPlanDraftFailure(
                  event.target.value as "stop" | "continue",
                ),
              )
            }
          >
            <NativeSelectOption value="continue">
              继续其他剧本
            </NativeSelectOption>
            <NativeSelectOption value="stop">停止整个编排</NativeSelectOption>
          </NativeSelect>
          <span className="min-w-0 flex-1" />
          <span>
            {
              new Set(
                laneScenarios.flatMap((scene) =>
                  scene ? [scene.channelId] : [],
                ),
              ).size
            }{" "}
            个平台 ·{" "}
            {laneScenarios.reduce(
              (sum, scene) => sum + (scene?.steps.length ?? 0),
              0,
            )}{" "}
            个事件
          </span>
        </div>
        {runLanes.length ? (
          <section className="mt-6 flex flex-col gap-3">
            <h3 className="text-sm font-semibold">
              本次运行 ·{" "}
              {(active?.mode ?? last?.mode ?? draft.mode) === "parallel"
                ? "并行"
                : "串行"}
              快照
            </h3>
            <RunLanes
              lanes={runLanes}
              mode={active?.mode ?? last?.mode ?? draft.mode}
            />
          </section>
        ) : null}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground lg:px-6">
        <StudioIcon name="info" />
        <span className="text-muted-foreground">
          运行使用启动时的快照，后续编辑不影响正在执行的任务
        </span>
      </footer>
      {picker ? (
        <MaterialPicker
          title="添加已保存剧本"
          description="可以选择不同平台的剧本，空剧本需添加步骤并保存后才可选择。"
          items={scenarios
            .filter((scene) => scene.steps.length > 0)
            .map((scene) => ({
              id: scene.id,
              name: scene.name,
              channel: scene.channelId,
              description: `${channelById(scene.channelId)?.name} · ${scene.steps.length} 步 · v${scene.revision ?? 1}`,
            }))}
          onClose={() => setPicker(false)}
          onSelect={(scenarioId) =>
            dispatch(addPlanLane({ scenarioId })).unwrap()
          }
          filterByChannel
        />
      ) : null}
      {copying ? (
        <SaveAsDialog
          label="编排"
          name={draft.name}
          onSave={(name) => dispatch(savePlanAs(name)).unwrap()}
          onClose={() => setCopying(false)}
        />
      ) : null}
    </>
  );
}
