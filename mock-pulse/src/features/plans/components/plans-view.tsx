import { useState } from "react";
import { DraftGuard } from "@/components/draft-guard";
import { DeleteEntityDialog } from "@/components/entity-dialogs";
import {
  ResourceFilters,
  ResourceLibrary,
} from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { StudioButton, StudioDialog } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { type PlanMode, planModeLabel } from "../model";
import { filterPlans, paginatePlans } from "../selectors";
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
      onSave={() => dispatch(actions.savePlan()).unwrap()}
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
            <div className="empty workspace-empty">
              <StudioIcon name="plan" />
              <h3>选择一个编排开始</h3>
              <StudioButton tone="soft" onClick={openCreate}>
                <StudioIcon name="plus" />
                新建
              </StudioButton>
            </div>
          )}
          {creating ? (
            <StudioDialog
              open
              title="新建编排"
              description="从已保存剧本开始，选择串行或并行执行。"
              onClose={() => setCreating(false)}
              footer={
                <>
                  <StudioButton onClick={() => setCreating(false)}>
                    取消
                  </StudioButton>
                  <StudioButton tone="primary" onClick={create}>
                    <StudioIcon name="arrow" />
                    开始编辑
                  </StudioButton>
                </>
              }
            >
              <FieldGroup className="modal-fields">
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
                  <select
                    id="new-plan-mode"
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as PlanMode)
                    }
                  >
                    <option value="parallel">并行执行</option>
                    <option value="serial">串行执行</option>
                  </select>
                </Field>
              </FieldGroup>
              {error ? (
                <p className="modal-inline-error" role="alert">
                  {error}
                </p>
              ) : null}
            </StudioDialog>
          ) : null}
          {deleting ? (
            <DeleteEntityDialog
              label="编排"
              name={
                state.items.find((item) => item.id === deleting)?.name ?? ""
              }
              onDelete={() => dispatch(actions.deletePlan(deleting)).unwrap()}
              onClose={() => setDeleting(null)}
            />
          ) : null}
        </ResourceWorkspace>
      )}
    </DraftGuard>
  );
}
