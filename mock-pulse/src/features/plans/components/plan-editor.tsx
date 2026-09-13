import { Fragment, useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { MaterialPicker } from "@/components/material-picker";
import {
  EntityHeader,
  IconButton,
  StudioButton,
} from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
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
import type { PlanMode } from "../model";
import * as actions from "../stores/plans-slice";

export function PlanEditor() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.plans);
  const scenarios = useAppSelector((root) => root.scenarios.items);
  const events = useAppSelector((root) => root.events.items);
  const runs = useAppSelector((root) => root.runs);
  const [picker, setPicker] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = state.draft;
  if (!draft) return null;
  const saved = state.items.find((item) => item.id === draft.id);
  const dirty = actions.selectPlanDirty(state);
  const laneScenarios = draft.items.map(
    (item) =>
      item.snapshot ?? scenarios.find((scene) => scene.id === item.scenarioId),
  );
  const active = state.live?.sourceId === draft.id ? state.live : null;
  const last = [...runs.items]
    .reverse()
    .find((run) => run.source === "plan" && run.sourceId === draft.id);
  const runLanes = active
    ? active.lanes.map((lane) => ({
        name: lane.scenarioName,
        channel:
          lane.channel ??
          lane.steps.find((step) => step.step)?.step?.channel ??
          ("douyin" as const),
        steps: lane.steps.map((step) => ({
          name: step.eventName,
          status: step.status,
        })),
      }))
    : last
      ? recordLanes(last)
      : [];
  const busy =
    ["starting", "running"].includes(state.planRunPhase) ||
    ["starting", "running"].includes(runs.scenarioRunPhase) ||
    runs.phase === "sending";
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
            <StudioButton tone="quiet" onClick={() => setCopying(true)}>
              另存为
            </StudioButton>
            <StudioButton
              tone={dirty ? "soft" : undefined}
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void perform(() =>
                  dispatch(actions.savePlan()).unwrap(),
                ).finally(() => setSaving(false));
              }}
            >
              <StudioIcon name="save" />
              保存编排
            </StudioButton>
            <StudioButton
              tone={active ? "danger" : "primary"}
              disabled={active ? runs.stoppingRunId === active.runId : busy}
              onClick={() =>
                void perform(() =>
                  active
                    ? dispatch(stopRun(active.runId)).unwrap()
                    : dispatch(actions.startPlanRun()).unwrap(),
                )
              }
            >
              <StudioIcon name={active ? "stop" : "play"} />
              {active && runs.stoppingRunId === active.runId
                ? "正在停止…"
                : active
                  ? "停止运行"
                  : "运行编排"}
            </StudioButton>
          </>
        }
      />
      <div className="editor-tabs">
        <span className="tab active">
          执行计划 <span className="count-inline">{draft.items.length}</span>
        </span>
        <span className="grow" />
        <span className="tiny-note">每个剧本内部仍按顺序执行</span>
      </div>
      {error || state.planRunPhase === "error" ? (
        <div role="alert" className="editor-error">
          {error || state.planRunMessage}
        </div>
      ) : null}
      {state.planRunPhase === "needConnection" ? (
        <div className="info-line">
          <StudioIcon name="info" />
          <span>
            请先配置
            {state.needConnectionChannels
              .map((id) => channelById(id)?.name)
              .join("、")}
            的连接。
          </span>
          <StudioButton small onClick={() => dispatch(setView("connections"))}>
            前往平台连接
          </StudioButton>
        </div>
      ) : null}
      <div className="editor-scroll">
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
          className="mode-switch"
          value={[draft.mode]}
          onValueChange={(values) => {
            if (values[0])
              dispatch(actions.setPlanDraftMode(values[0] as PlanMode));
          }}
          aria-label="执行模式"
        >
          <ToggleGroupItem
            className={cn("mode-option", draft.mode === "parallel" && "active")}
            value="parallel"
          >
            <StudioIcon name="parallel" />
            并行执行
          </ToggleGroupItem>
          <ToggleGroupItem
            className={cn("mode-option", draft.mode === "serial" && "active")}
            value="serial"
          >
            <StudioIcon name="serial" />
            串行执行
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="mode-copy">
          {draft.mode === "parallel"
            ? "所有剧本同时开始，分别执行各自的事件序列。"
            : "按下方排列顺序，等待一个剧本结束，再开始下一个。"}
        </p>
        {draft.mode === "parallel" && draft.items.length ? (
          <div className="parallel-marker">
            T + 0 <span>同时起跑</span>
          </div>
        ) : null}
        <div className="run-lanes">
          {draft.items.map((item, index) => {
            const scene = laneScenarios[index];
            const current = scenarios.find(
              (candidate) => candidate.id === item.scenarioId,
            );
            const outdated =
              scene &&
              current &&
              (current.revision ?? 1) > (scene.revision ?? 1);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 编排允许重复剧本；轨道按模型中的位置标识，没有局部组件状态。
              <Fragment key={`${index}-${item.scenarioId}`}>
                {draft.mode === "serial" && index > 0 ? (
                  <div className="serial-join">
                    <StudioIcon name="down" />
                    上一剧本结束后开始
                  </div>
                ) : null}
                <article className="lane">
                  <header className="lane-head">
                    <span className="lane-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {scene ? (
                      <ChannelMark channel={scene.channelId} />
                    ) : (
                      <StudioIcon name="info" />
                    )}
                    <div className="grow">
                      <h3>{scene?.name ?? "来源剧本不存在"}</h3>
                      <p>
                        {scene
                          ? `${channelById(scene.channelId)?.name} · ${scene.steps.length} 步 · v${scene.revision ?? 1}`
                          : "请移除后重新选择"}
                        {outdated ? (
                          <button
                            type="button"
                            className="text-btn tiny-note"
                            onClick={() =>
                              void perform(() =>
                                dispatch(actions.syncPlanLane(index)).unwrap(),
                              )
                            }
                          >
                            有新版本 · 同步
                          </button>
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
                  <div className="lane-track">
                    {scene?.steps.length ? (
                      scene.steps.map((step, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 这是固定剧本快照，同一事件可以出现多次，步骤位置是快照标识。
                        <Fragment key={`${i}-${step.eventId}`}>
                          {i ? <span className="track-arrow">→</span> : null}
                          <div className="lane-node">
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
                      <span className="muted">这个剧本还没有步骤</span>
                    )}
                  </div>
                </article>
              </Fragment>
            );
          })}
        </div>
        <button
          type="button"
          className="add-lane"
          onClick={() => setPicker(true)}
        >
          <StudioIcon name="plus" />
          添加已保存剧本
        </button>
        <div className="builder-bottom plan-bottom">
          <span>剧本失败时</span>
          <select
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
            <option value="continue">继续其他剧本</option>
            <option value="stop">停止整个编排</option>
          </select>
          <span className="grow" />
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
          <section className="run-detail-section">
            <h3 className="section-title">
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
      <footer className="receipt-bar">
        <StudioIcon name="info" />
        <span className="muted">
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
            dispatch(actions.addPlanLane({ scenarioId })).unwrap()
          }
          filterByChannel
        />
      ) : null}
      {copying ? (
        <SaveAsDialog
          label="编排"
          name={draft.name}
          onSave={(name) => dispatch(actions.savePlanAs(name)).unwrap()}
          onClose={() => setCopying(false)}
        />
      ) : null}
    </>
  );
}
