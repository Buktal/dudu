import { ArrowRightIcon, PlusIcon, WorkflowIcon } from "lucide-react";
import { useState } from "react";
import { DraftGuard } from "@/components/draft-guard";
import { DeleteEntityDialog } from "@/components/entity-dialogs";
import {
  ResourceFilters,
  ResourceLibrary,
} from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { type PlanMode, planModeLabel } from "../model";
import { filterPlans, paginatePlans } from "../selectors";
import { deletePlan, savePlan } from "../stores/plan-library";
import * as actions from "../stores/plans-slice";
import { PlanEditor } from "./plan-editor";

export function PlansView() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.plans);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<PlanMode>("parallel");
  const [error, setError] = useState("");
  const page = paginatePlans(
    filterPlans(state.items, state.filters),
    state.page,
  );
  const openCreate = () => {
    setName("");
    setMode("parallel");
    setError("");
    setCreating(true);
  };
  const create = () => {
    if (!name.trim()) {
      setError("请填写编排名称。");
      return;
    }
    dispatch(actions.startPlanDraft({ name: name.trim(), mode }));
    setCreating(false);
  };
  return (
    <DraftGuard
      dirty={actions.selectPlanDirty(state)}
      name={state.draft?.name ?? ""}
      onSave={() => dispatch(savePlan()).unwrap()}
      onDiscard={() => dispatch(actions.discardPlanDraft())}
    >
      {(request) => (
        <ResourceWorkspace
          viewId="plans"
          libraryLabel="已保存编排"
          library={(close) => (
            <ResourceLibrary
              title="已保存编排"
              singular="编排"
              total={state.items.length}
              query={state.filters.query}
              onQuery={(query) => dispatch(actions.setFilters({ query }))}
              onCreate={() => {
                close();
                request(openCreate);
              }}
              filters={
                <ResourceFilters
                  value={state.filters.kind}
                  options={[
                    { value: "all", label: "全部" },
                    { value: "favorite", label: "收藏" },
                  ]}
                  onChange={(kind) => dispatch(actions.setFilters({ kind }))}
                />
              }
              entries={page.items.map((row) => ({
                id: row.plan.id,
                name: row.plan.name,
                favorite: row.plan.favorite,
                description: `${row.plan.items.length} 个剧本 · ${planModeLabel(row.plan.mode)}`,
              }))}
              selectedId={state.selectedId}
              onSelect={(id) => {
                close();
                if (id !== state.draft?.id)
                  request(() => dispatch(actions.openPlan(id)));
              }}
              onContextMenu={setDeleting}
              page={page.page}
              pages={page.pages}
              filteredTotal={page.total}
              onPage={(value) => dispatch(actions.setPage(value))}
              onClear={() =>
                dispatch(actions.setFilters({ query: "", kind: "all" }))
              }
            />
          )}
        >
          {state.draft ? (
            <PlanEditor key={state.draft.id} />
          ) : (
            <Empty className="min-h-60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WorkflowIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>选择一个编排开始</EmptyTitle>
                <EmptyDescription>
                  把多个平台剧本串行或并行执行，复用一整套回归计划。
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="secondary" onClick={openCreate}>
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                新建编排
              </Button>
            </Empty>
          )}
          {creating ? (
            <WorkspaceDialog
              open
              title="新建编排"
              description="从已保存剧本开始，选择串行或并行执行。"
              onClose={() => setCreating(false)}
              footer={
                <>
                  <Button onClick={() => setCreating(false)} variant="outline">
                    取消
                  </Button>
                  <Button variant="default" onClick={create}>
                    <ArrowRightIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                    />
                    开始编辑
                  </Button>
                </>
              }
            >
              <FieldGroup className="gap-4">
                <Field data-invalid={!!error}>
                  <FieldLabel htmlFor="new-plan-name">编排名称</FieldLabel>
                  <Input
                    id="new-plan-name"
                    autoFocus
                    maxLength={80}
                    placeholder="例如：双平台完整回归"
                    value={name}
                    aria-invalid={!!error}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError("");
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        create();
                      }
                    }}
                  />
                  {error ? <FieldError>{error}</FieldError> : null}
                </Field>
                <Field>
                  <FieldLabel>执行方式</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    value={[mode]}
                    aria-label="执行方式"
                    onValueChange={(values) => {
                      if (values[0]) setMode(values[0] as PlanMode);
                    }}
                  >
                    <ToggleGroupItem value="parallel" className="flex-1">
                      并行执行
                    </ToggleGroupItem>
                    <ToggleGroupItem value="serial" className="flex-1">
                      串行执行
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </WorkspaceDialog>
          ) : null}
          {deleting ? (
            <DeleteEntityDialog
              label="编排"
              name={
                state.items.find((item) => item.id === deleting)?.name ?? ""
              }
              onDelete={() => dispatch(deletePlan(deleting)).unwrap()}
              onClose={() => setDeleting(null)}
            />
          ) : null}
        </ResourceWorkspace>
      )}
    </DraftGuard>
  );
}
