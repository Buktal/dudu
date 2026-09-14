import { useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { ChannelPicker } from "@/components/channel-picker";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { IconButton } from "@/components/icon-button";
import { MaterialPicker } from "@/components/material-picker";
import { Notice } from "@/components/notice";
import { StudioIcon } from "@/components/studio-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { payloadPreview, schemaById } from "@/features/events";
import {
  isRunBusy,
  isStoppingRun,
  liveLanes,
  RunLanes,
  RunPersistenceNotice,
  RunSummary,
  recordLanes,
  selectLiveRunFor,
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
  // 任一运行（直发/剧本/编排）进行中即 busy——运行会话统一口径
  const busy = useAppSelector((root) => isRunBusy(root));
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
  // 实况本体在 runs 域，这里按剧本 id 派生本剧本的进行中实况
  const active = selectLiveRunFor(runs, "scenario", draft.id);
  const lastRun = [...runs.items]
    .reverse()
    .find((run) => run.source === "scenario" && run.sourceId === draft.id);
  const lanes = active
    ? liveLanes(active)
    : lastRun
      ? recordLanes(lastRun)
      : [];
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
            <Button variant="ghost" onClick={() => setCopying(true)}>
              另存为
            </Button>
            <Button
              variant={dirty ? "secondary" : "outline"}
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void perform(() =>
                  dispatch(actions.saveScenario()).unwrap(),
                ).finally(() => setSaving(false));
              }}
            >
              <StudioIcon name="save" data-icon="inline-start" />
              保存剧本
            </Button>
            <Button
              variant={active ? "destructive" : "default"}
              disabled={active ? isStoppingRun(runs, active.runId) : busy}
              onClick={() =>
                void perform(() =>
                  active
                    ? dispatch(stopRun(active.runId)).unwrap()
                    : dispatch(startScenarioRun({ scenario: draft })).unwrap(),
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
                  : "运行剧本"}
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 lg:px-6">
        <span className="flex items-center gap-2">
          步骤编排{" "}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {draft.steps.length}
          </span>
        </span>
        <span className="min-w-0 flex-1" />
        <span className="text-xs text-muted-foreground">按顺序执行</span>
      </div>
      {error || runs.scenarioRunPhase === "error" ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error || runs.scenarioRunMessage}
        </Notice>
      ) : null}
      {runs.scenarioRunPhase === "needConnection" ? (
        <Notice className="mb-4">
          <StudioIcon name="info" />
          <span>请先为{channel?.name}配置回调地址和凭据。</span>
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
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <ChannelMark channel={draft.channelId} />
          <div className="min-w-0 flex-1">
            <h3>
              {channel?.name}剧本{" "}
              <Badge variant="secondary">
                {draft.steps.length ? "平台已锁定" : "等待添加首步"}
              </Badge>
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
        <div className="flex flex-col gap-3">
          {steps.map((row) => {
            const schema = row.event
              ? schemaById(row.event.schemaId)
              : undefined;
            return (
              <div
                className="flex items-start gap-3"
                key={`${row.index}-${row.step.eventId}`}
              >
                <div className="flex w-7 shrink-0 justify-center pt-4">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
                    {String(row.index + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="min-w-0 flex-1 rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className="h-auto min-w-0 justify-start gap-2 p-0 "
                      onClick={() => setPicker(row.index)}
                      title="从本平台事件中替换"
                      variant="ghost"
                    >
                      <StudioIcon
                        name={schema?.kind === "message" ? "message" : "event"}
                      />
                      <h3 className="truncate">
                        {row.event?.name ?? "来源事件不存在"}
                      </h3>
                      <StudioIcon name="chevron" />
                    </Button>
                    <span className="min-w-0 flex-1" />
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{schema?.name}</span>
                    <span>·</span>
                    <span>已保存版本 v{row.step.revision}</span>
                    {row.outdated ? (
                      <Button
                        type="button"
                        className="h-auto p-0 text-xs text-muted-foreground"
                        onClick={() =>
                          void perform(() =>
                            dispatch(
                              actions.syncScenarioStep({ index: row.index }),
                            ).unwrap(),
                          )
                        }
                        variant="link"
                      >
                        有新版本 v{row.latestRevision} · 同步
                      </Button>
                    ) : null}
                  </div>
                  <div className="my-3 rounded-lg bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                    {row.referenced && schema
                      ? payloadPreview(schema, row.referenced.payload)
                      : "来源版本不可用，请重新选择事件。"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      发送前等待
                    </span>
                    <Input
                      className="w-20"
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
                    <span className="text-xs text-muted-foreground">秒</span>
                    <Badge variant="secondary">
                      期望 {row.referenced?.expected.status ?? "—"}
                    </Badge>
                    <span className="min-w-0 flex-1" />
                    <Button
                      type="button"
                      className="h-auto p-0 "
                      disabled={!row.event}
                      onClick={() => onEditEvent?.(row.step.eventId)}
                      variant="link"
                    >
                      编辑来源
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || !row.referenced}
                      onClick={() =>
                        void perform(() =>
                          dispatch(
                            startScenarioRun({
                              scenario: draft,
                              stepIndex: row.index,
                            }),
                          ).unwrap(),
                        )
                      }
                    >
                      <StudioIcon name="play" data-icon="inline-start" />
                      发送此步
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          className="my-4 w-full "
          onClick={() => setPicker("add")}
          variant="outline"
        >
          <StudioIcon name="plus" />
          添加已保存事件
        </Button>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>步骤失败时</span>
          <NativeSelect
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
            <NativeSelectOption value="stop">停止当前剧本</NativeSelectOption>
            <NativeSelectOption value="continue">继续下一步</NativeSelectOption>
          </NativeSelect>
          <span className="min-w-0 flex-1" />
          <span>
            {draft.steps.length} 步 · 总等待{" "}
            {draft.steps
              .reduce((sum, step) => sum + (step.wait ?? 0), 0)
              .toFixed(1)}{" "}
            秒
          </span>
        </div>
        {lanes.length ? (
          <div className="mt-6 flex flex-col gap-3">
            <RunLanes lanes={lanes} />
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground lg:px-6">
        <StudioIcon name="link" />
        <span className="text-muted-foreground">
          从已保存事件组装，编辑来源后可主动同步版本
        </span>
        <span className="min-w-0 flex-1" />
        {saved && onAddToPlan ? (
          <Button size="sm" variant="ghost" onClick={() => onAddToPlan(saved)}>
            <StudioIcon name="plan" data-icon="inline-start" />
            加入执行编排
          </Button>
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
