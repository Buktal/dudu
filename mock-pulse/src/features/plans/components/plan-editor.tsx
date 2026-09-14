import {
  GitForkIcon,
  InfoIcon,
  ListOrderedIcon,
  PlusIcon,
  SaveIcon,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { MaterialPicker } from "@/components/material-picker";
import { Notice } from "@/components/notice";
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
import { RunButton, RunConnectionNotice, RunSection } from "@/features/runs";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import { type PlanMode, resolveLaneScenario } from "../model";
import { planStats } from "../selectors";
import {
  addPlanLane,
  savePlan,
  savePlanAs,
  syncPlanLane,
} from "../stores/plan-library";
import { startPlanRun } from "../stores/plan-run";
import * as actions from "../stores/plans-slice";

import { PlanLanes } from "./plan-lanes";

export function PlanEditor() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.plans);
  const scenarios = useAppSelector((root) => root.scenarios.items);
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
  const stats = planStats(laneScenarios);
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
        icon={<WorkflowIcon aria-hidden="true" className="size-4 shrink-0" />}
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
              disabled={saving || !dirty}
              onClick={() => {
                setSaving(true);
                void perform(async () => {
                  await dispatch(savePlan()).unwrap();
                  toast.add({ title: "编排已保存", type: "success" });
                }).finally(() => setSaving(false));
              }}
            >
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {saving ? "正在保存…" : "保存编排"}
            </Button>
            <RunButton
              kind="plan"
              sourceId={draft.id}
              startLabel="运行编排"
              onStart={() => dispatch(startPlanRun()).unwrap()}
              perform={perform}
            />
          </>
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-y bg-card px-5 py-3 lg:px-7">
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
        <RunConnectionNotice
          message={`请先配置${state.needConnectionChannels
            .map((id) => channelById(id)?.name)
            .join("、")}的连接。`}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background/50 p-5 lg:p-7">
        <RunSection
          kind="plan"
          sourceId={draft.id}
          mode={draft.mode}
          perform={perform}
          lanesHeading
        >
          <ToggleGroup
            className="w-fit"
            variant="outline"
            value={[draft.mode]}
            onValueChange={(values) => {
              if (values[0])
                dispatch(actions.setPlanDraftMode(values[0] as PlanMode));
            }}
            aria-label="执行模式"
          >
            <ToggleGroupItem value="parallel">
              <GitForkIcon aria-hidden="true" />
              并行执行
            </ToggleGroupItem>
            <ToggleGroupItem value="serial">
              <ListOrderedIcon aria-hidden="true" />
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
          {!draft.items.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WorkflowIcon />
                </EmptyMedia>
                <EmptyTitle>从一个剧本开始</EmptyTitle>
                <EmptyDescription>
                  组合不同平台的已保存剧本，一次运行完整的回归流程。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          <PlanLanes
            items={draft.items}
            mode={draft.mode}
            onSync={(index) =>
              void perform(() => dispatch(syncPlanLane(index)).unwrap())
            }
          />
          <Button
            type="button"
            className="my-4 w-full"
            onClick={() => setPicker(true)}
            variant="outline"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            添加已保存剧本
          </Button>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <FieldGroup className="w-full sm:w-80">
              <Field>
                <FieldLabel>剧本失败时</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[draft.failure]}
                  aria-label="编排失败处理"
                  onValueChange={(values) => {
                    if (values[0])
                      dispatch(
                        actions.setPlanDraftFailure(
                          values[0] as "stop" | "continue",
                        ),
                      );
                  }}
                >
                  <ToggleGroupItem value="continue">
                    继续其他剧本
                  </ToggleGroupItem>
                  <ToggleGroupItem value="stop">停止整个编排</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>
            <span className="pb-2 text-xs text-muted-foreground">
              {stats.platformCount} 个平台 · {stats.eventCount} 个事件
            </span>
          </div>
        </RunSection>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-card px-5 py-3 text-xs text-muted-foreground lg:px-7">
        <InfoIcon aria-hidden="true" className="size-4 shrink-0" />
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
