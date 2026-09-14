import { LinkIcon, PlusIcon, SaveIcon, WorkflowIcon } from "lucide-react";
import { useState } from "react";
import { ChannelMark } from "@/components/channel-mark";
import { ChannelPicker } from "@/components/channel-picker";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { MaterialPicker } from "@/components/material-picker";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { schemaById } from "@/features/events";
import {
  isRunBusy,
  RunButton,
  RunConnectionNotice,
  RunSection,
  startScenarioRun,
} from "@/features/runs";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import type { Scenario } from "../model";
import { resolveSteps } from "../selectors";
import * as actions from "../stores/scenarios-slice";

import { ScenarioSteps } from "./scenario-steps";

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
  // 任一运行（直发/剧本/编排）进行中即 busy——运行会话统一口径
  const busy = useAppSelector((root) => isRunBusy(root));
  const runs = useAppSelector((root) => root.runs);
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
              disabled={saving || !dirty}
              onClick={() => {
                setSaving(true);
                void perform(async () => {
                  await dispatch(actions.saveScenario()).unwrap();
                  toast.add({ title: "剧本已保存", type: "success" });
                }).finally(() => setSaving(false));
              }}
            >
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {saving ? "正在保存…" : "保存剧本"}
            </Button>
            <RunButton
              kind="scenario"
              sourceId={draft.id}
              startLabel="运行剧本"
              onStart={() =>
                dispatch(startScenarioRun({ scenario: draft })).unwrap()
              }
              perform={perform}
            />
          </>
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-y bg-card px-5 py-3 lg:px-7">
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
        <RunConnectionNotice
          message={`请先为${channel?.name}配置回调地址和凭据。`}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background/50 p-5 lg:p-7">
        <RunSection
          kind="scenario"
          sourceId={draft.id}
          mode="serial"
          perform={perform}
        >
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <ChannelMark channel={draft.channelId} />
            <div className="min-w-0 flex-1">
              <h3 className="flex flex-wrap items-center gap-2 font-medium">
                {channel?.name}剧本{" "}
                <Badge variant="secondary">
                  {draft.steps.length ? "平台已锁定" : "等待添加首步"}
                </Badge>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                只能选择{channel?.name}
                下的已保存事件。每个步骤保留选入时的版本。
              </p>
            </div>
            {!draft.steps.length ? (
              <ChannelPicker
                value={draft.channelId}
                onSelect={(value) => dispatch(actions.setDraftChannel(value))}
              />
            ) : null}
          </div>
          {!steps.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlusIcon />
                </EmptyMedia>
                <EmptyTitle>添加第一步</EmptyTitle>
                <EmptyDescription>
                  选择已保存的{channel?.name}事件，串起一段完整的会话流程。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          <ScenarioSteps
            steps={steps}
            busy={busy}
            onReplace={setPicker}
            onMove={(index, delta) =>
              dispatch(actions.moveDraftStep({ index, delta }))
            }
            onRemove={(index) => dispatch(actions.removeDraftStep(index))}
            onSync={(index) =>
              void perform(() =>
                dispatch(actions.syncScenarioStep({ index })).unwrap(),
              )
            }
            onWait={(index, wait) =>
              dispatch(actions.setStepWait({ index, wait }))
            }
            onEdit={onEditEvent}
            onRun={(stepIndex) =>
              void perform(() =>
                dispatch(
                  startScenarioRun({ scenario: draft, stepIndex }),
                ).unwrap(),
              )
            }
          />
          <Button
            type="button"
            className="my-4 w-full"
            onClick={() => setPicker("add")}
            variant="outline"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            添加已保存事件
          </Button>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <FieldGroup className="w-full sm:w-80">
              <Field>
                <FieldLabel>步骤失败时</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[draft.failure ?? "stop"]}
                  aria-label="剧本步骤失败处理"
                  onValueChange={(values) => {
                    if (values[0])
                      dispatch(
                        actions.setScenarioFailure(
                          values[0] as "stop" | "continue",
                        ),
                      );
                  }}
                >
                  <ToggleGroupItem value="stop">停止当前剧本</ToggleGroupItem>
                  <ToggleGroupItem value="continue">继续下一步</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>
            <span className="pb-2 text-xs text-muted-foreground">
              {draft.steps.length} 步 · 总等待{" "}
              {draft.steps
                .reduce((sum, step) => sum + (step.wait ?? 0), 0)
                .toFixed(1)}{" "}
              秒
            </span>
          </div>
        </RunSection>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-5 py-3 text-xs text-muted-foreground lg:px-7">
        <LinkIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="text-muted-foreground">
          从已保存事件组装，编辑来源后可主动同步版本
        </span>
        <span className="min-w-0 flex-1" />
        {saved && onAddToPlan ? (
          <Button size="sm" variant="ghost" onClick={() => onAddToPlan(saved)}>
            <WorkflowIcon aria-hidden="true" data-icon="inline-start" />
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
