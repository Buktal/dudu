import { useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { ChannelPicker } from "@/components/channel-picker";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { MaterialPicker } from "@/components/material-picker";
import {
  EntityHeader,
  IconButton,
  StudioButton,
} from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { Input } from "@/components/ui/input";
import { payloadPreview, schemaById } from "@/features/events";
import {
  RunLanes,
  RunPersistenceNotice,
  RunSummary,
  recordLanes,
  selectRun,
  startScenarioRun,
  stopRun,
} from "@/features/runs";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import { setView } from "@/stores/app-slice";
import type { Scenario } from "../model";
import { resolveSteps } from "../selectors";
import * as actions from "../stores/scenarios-slice";

export type ScenarioEditorSlots = {
  onEditEvent?: (id: string) => void;
  onAddToPlan?: (scenario: Scenario) => void;
};

export function ScenarioEditor({
  onEditEvent,
  onAddToPlan,
}: ScenarioEditorSlots) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.scenarios);
  const events = useAppSelector((root) => root.events.items);
  const runs = useAppSelector((root) => root.runs);
  const plansBusy = useAppSelector((root) =>
    ["starting", "running"].includes(root.plans.planRunPhase),
  );
  const [picker, setPicker] = useState<number | "add" | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = state.draft;
  if (!draft) return null;
  const saved = state.items.find((item) => item.id === draft.id);
  const channel = channelById(draft.channelId);
  const dirty = actions.selectScenarioDirty(state);
  const steps = resolveSteps(draft.steps, events);
  const active = runs.live?.sourceId === draft.id ? runs.live : null;
  const lastRun = [...runs.items]
    .reverse()
    .find((run) => run.source === "scenario" && run.sourceId === draft.id);
  const lanes = active
    ? [
        {
          name: active.scenarioName,
          channel: active.channel,
          steps: active.steps.map((step) => ({
            name: step.eventName,
            status: step.status,
          })),
        },
      ]
    : lastRun
      ? recordLanes(lastRun)
      : [];
  const busy =
    plansBusy ||
    runs.phase === "sending" ||
    ["starting", "running"].includes(runs.scenarioRunPhase);
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
        label="剧本"
        name={draft.name}
        channel={draft.channelId}
        kicker="平台内顺序流程"
        onNameChange={(name) => dispatch(actions.setDraftName(name))}
        dirty={dirty}
        saved={!!saved}
        revision={saved ? (saved.revision ?? 1) : undefined}
        favorite={draft.favorite}
        onFavorite={() => dispatch(actions.toggleScenarioFavorite())}
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
                  dispatch(actions.saveScenario()).unwrap(),
                ).finally(() => setSaving(false));
              }}
            >
              <StudioIcon name="save" />
              保存剧本
            </StudioButton>
            <StudioButton
              tone={active ? "danger" : "primary"}
              disabled={active ? runs.stoppingRunId === active.runId : busy}
              onClick={() =>
                void perform(() =>
                  active
                    ? dispatch(stopRun(active.runId)).unwrap()
                    : dispatch(startScenarioRun()).unwrap(),
                )
              }
            >
              <StudioIcon name={active ? "stop" : "play"} />
              {active && runs.stoppingRunId === active.runId
                ? "正在停止…"
                : active
                  ? "停止运行"
                  : "运行剧本"}
            </StudioButton>
          </>
        }
      />
      <div className="editor-tabs">
        <span className="tab active">
          步骤编排 <span className="count-inline">{draft.steps.length}</span>
        </span>
        <span className="grow" />
        <span className="tiny-note">按顺序执行</span>
      </div>
      {error || runs.scenarioRunPhase === "error" ? (
        <div role="alert" className="editor-error">
          {error || runs.scenarioRunMessage}
        </div>
      ) : null}
      {runs.scenarioRunPhase === "needConnection" ? (
        <div className="info-line">
          <StudioIcon name="info" />
          <span>请先为{channel?.name}配置回调地址和凭据。</span>
          <StudioButton small onClick={() => dispatch(setView("connections"))}>
            前往平台连接
          </StudioButton>
        </div>
      ) : null}
      <div className="editor-scroll">
        <RunPersistenceNotice runId={lastRun?.id} />
        {lanes.length ? (
          <RunSummary
            lanes={lanes}
            active={!!active}
            onStop={() =>
              active &&
              void perform(() => dispatch(stopRun(active.runId)).unwrap())
            }
            onOpen={() => {
              if (lastRun) dispatch(selectRun(lastRun.id));
              dispatch(setView("runs"));
            }}
          />
        ) : null}
        <div className="builder-intro">
          <ChannelMark channel={draft.channelId} />
          <div className="grow">
            <h3>
              {channel?.name}剧本{" "}
              <span className="pill">
                {draft.steps.length ? "平台已锁定" : "等待添加首步"}
              </span>
            </h3>
            <p>
              只能选择{channel?.name}下的已保存事件。每个步骤保留选入时的版本。
            </p>
          </div>
          {!draft.steps.length ? (
            <ChannelPicker
              value={draft.channelId}
              onSelect={(value) => dispatch(actions.setDraftChannel(value))}
            />
          ) : null}
        </div>
        <div className="step-list">
          {steps.map((row) => {
            const schema = row.event
              ? schemaById(row.event.schemaId)
              : undefined;
            return (
              <div
                className="step-wrap"
                key={`${row.index}-${row.step.eventId}`}
              >
                <div className="step-order">
                  <span className="order-dot">
                    {String(row.index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="step-card">
                  <div className="step-card-top">
                    <button
                      type="button"
                      className="step-select"
                      onClick={() => setPicker(row.index)}
                      title="从本平台事件中替换"
                    >
                      <StudioIcon
                        name={schema?.kind === "message" ? "message" : "event"}
                      />
                      <h3 className="truncate">
                        {row.event?.name ?? "来源事件不存在"}
                      </h3>
                      <StudioIcon name="chevron" />
                    </button>
                    <span className="grow" />
                    <IconButton
                      label="步骤上移"
                      disabled={row.index === 0}
                      onClick={() =>
                        dispatch(
                          actions.moveDraftStep({
                            index: row.index,
                            delta: -1,
                          }),
                        )
                      }
                    >
                      <StudioIcon name="up" />
                    </IconButton>
                    <IconButton
                      label="步骤下移"
                      disabled={row.index === steps.length - 1}
                      onClick={() =>
                        dispatch(
                          actions.moveDraftStep({ index: row.index, delta: 1 }),
                        )
                      }
                    >
                      <StudioIcon name="down" />
                    </IconButton>
                    <IconButton
                      label="移除此步骤"
                      onClick={() =>
                        dispatch(actions.removeDraftStep(row.index))
                      }
                    >
                      <StudioIcon name="x" />
                    </IconButton>
                  </div>
                  <div className="step-meta">
                    <span>{schema?.name}</span>
                    <span>·</span>
                    <span>已保存版本 v{row.step.revision}</span>
                    {row.outdated ? (
                      <button
                        type="button"
                        className="text-btn tiny-note"
                        onClick={() =>
                          void perform(() =>
                            dispatch(
                              actions.syncScenarioStep({ index: row.index }),
                            ).unwrap(),
                          )
                        }
                      >
                        有新版本 v{row.latestRevision} · 同步
                      </button>
                    ) : null}
                  </div>
                  <div className="step-preview">
                    {row.referenced && schema
                      ? payloadPreview(schema, row.referenced.payload)
                      : "来源版本不可用，请重新选择事件。"}
                  </div>
                  <div className="step-controls">
                    <span className="tiny-label">发送前等待</span>
                    <Input
                      className="wait-input"
                      type="number"
                      min={0}
                      max={60}
                      step={0.1}
                      value={row.step.wait ?? 0}
                      aria-label={`步骤 ${row.index + 1} 发送前等待秒数`}
                      onChange={(event) =>
                        dispatch(
                          actions.setStepWait({
                            index: row.index,
                            wait: Number(event.target.value),
                          }),
                        )
                      }
                    />
                    <span className="tiny-label">秒</span>
                    <span className="pill">
                      期望 {row.referenced?.expected.status ?? "—"}
                    </span>
                    <span className="grow" />
                    <button
                      type="button"
                      className="text-btn"
                      disabled={!row.event}
                      onClick={() => onEditEvent?.(row.step.eventId)}
                    >
                      编辑来源
                    </button>
                    <StudioButton
                      small
                      tone="quiet"
                      disabled={busy || !row.referenced}
                      onClick={() =>
                        void perform(() =>
                          dispatch(
                            startScenarioRun({ stepIndex: row.index }),
                          ).unwrap(),
                        )
                      }
                    >
                      <StudioIcon name="play" />
                      发送此步
                    </StudioButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="add-step"
          onClick={() => setPicker("add")}
        >
          <StudioIcon name="plus" />
          添加已保存事件
        </button>
        <div className="builder-bottom">
          <span>步骤失败时</span>
          <select
            aria-label="剧本步骤失败处理"
            value={draft.failure ?? "stop"}
            onChange={(event) =>
              dispatch(
                actions.setScenarioFailure(
                  event.target.value as "stop" | "continue",
                ),
              )
            }
          >
            <option value="stop">停止当前剧本</option>
            <option value="continue">继续下一步</option>
          </select>
          <span className="grow" />
          <span>
            {draft.steps.length} 步 · 总等待{" "}
            {draft.steps
              .reduce((sum, step) => sum + (step.wait ?? 0), 0)
              .toFixed(1)}{" "}
            秒
          </span>
        </div>
        {lanes.length ? (
          <div className="run-detail-section">
            <RunLanes lanes={lanes} />
          </div>
        ) : null}
      </div>
      <footer className="receipt-bar">
        <StudioIcon name="link" />
        <span className="muted">
          从已保存事件组装，编辑来源后可主动同步版本
        </span>
        <span className="grow" />
        {saved && onAddToPlan ? (
          <StudioButton small tone="quiet" onClick={() => onAddToPlan(saved)}>
            <StudioIcon name="plan" />
            加入执行编排
          </StudioButton>
        ) : null}
      </footer>
      {picker !== null ? (
        <MaterialPicker
          title={`选择${channel?.name}事件`}
          description={`仅显示${channel?.name}的已保存事件；选入后保留当前版本。`}
          items={events
            .filter(
              (item) =>
                item.channelId === draft.channelId && item.versions.length > 0,
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              channel: item.channelId,
              description: `${schemaById(item.schemaId).name} · v${item.versions[item.versions.length - 1]?.revision}`,
            }))}
          onClose={() => setPicker(null)}
          onSelect={(eventId) =>
            picker === "add"
              ? dispatch(actions.addScenarioStep({ eventId })).unwrap()
              : dispatch(
                  actions.replaceScenarioStep({ index: picker, eventId }),
                ).unwrap()
          }
        />
      ) : null}
      {copying ? (
        <SaveAsDialog
          label="剧本"
          name={draft.name}
          onSave={(name) => dispatch(actions.saveScenarioAs(name)).unwrap()}
          onClose={() => setCopying(false)}
        />
      ) : null}
    </>
  );
}
