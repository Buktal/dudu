import { useState } from "react";
import { DraftGuard } from "@/components/draft-guard";
import { DeleteEntityDialog } from "@/components/entity-dialogs";
import { Notice } from "@/components/notice";
import {
  ResourceFilters,
  ResourceLibrary,
} from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { StudioIcon } from "@/components/studio-icon";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
                  <StudioIcon name="plan" />
                </EmptyMedia>
                <EmptyTitle>选择一个编排开始</EmptyTitle>
              </EmptyHeader>
              <Button variant="secondary" onClick={openCreate}>
                <StudioIcon name="plus" data-icon="inline-start" />
                新建
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
                    <StudioIcon name="arrow" data-icon="inline-start" />
                    开始编辑
                  </Button>
                </>
              }
            >
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="new-plan-name">编排名称</FieldLabel>
                  <Input
                    id="new-plan-name"
                    autoFocus
                    maxLength={80}
                    placeholder="例如：双平台完整回归"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") create();
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-plan-mode">执行方式</FieldLabel>
                  <NativeSelect
                    id="new-plan-mode"
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as PlanMode)
                    }
                  >
                    <NativeSelectOption value="parallel">
                      并行执行
                    </NativeSelectOption>
                    <NativeSelectOption value="serial">
                      串行执行
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </FieldGroup>
              {error ? (
                <Notice className="mb-4" role="alert" variant="destructive">
                  {error}
                </Notice>
              ) : null}
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
