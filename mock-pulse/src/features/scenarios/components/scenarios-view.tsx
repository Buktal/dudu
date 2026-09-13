import { useState } from "react";
import { ChannelPicker } from "@/components/channel-picker";
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
import { CHANNELS, type ChannelId } from "@/lib/channels";
import { filterScenarios, paginateScenarios } from "../selectors";
import * as actions from "../stores/scenarios-slice";
import { ScenarioEditor, type ScenarioEditorSlots } from "./scenario-editor";

export function ScenariosView({
  onDeleteScenario,
  ...slots
}: ScenarioEditorSlots & { onDeleteScenario: (id: string) => Promise<void> }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.scenarios);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelId>("douyin");
  const [error, setError] = useState("");
  const rows = filterScenarios(state.items, state.filters);
  const page = paginateScenarios(rows, state.page);
  const create = () => {
    if (!name.trim()) {
      setError("请填写剧本名称。");
      return;
    }
    dispatch(
      actions.startScenarioDraft({ name: name.trim(), channelId: channel }),
    );
    setCreating(false);
  };
  const openCreate = () => {
    setName("");
    setChannel(
      state.filters.channel === "all" ? "douyin" : state.filters.channel,
    );
    setError("");
    setCreating(true);
  };
  return (
    <DraftGuard
      dirty={actions.selectScenarioDirty(state)}
      name={state.draft?.name ?? ""}
      onSave={() => dispatch(actions.saveScenario()).unwrap()}
      onDiscard={() => dispatch(actions.discardScenarioDraft())}
    >
      {(request) => (
        <ResourceWorkspace
          viewId="scenarios"
          libraryLabel="已保存剧本"
          library={(close) => (
            <ResourceLibrary
              title="已保存剧本"
              singular="剧本"
              total={state.items.length}
              query={state.filters.query}
              onQuery={(query) => dispatch(actions.setFilters({ query }))}
              onCreate={() => {
                close();
                request(openCreate);
              }}
              filters={
                <>
                  <ChannelPicker
                    allowAll
                    value={state.filters.channel}
                    onSelect={(value) =>
                      dispatch(actions.setFilters({ channel: value }))
                    }
                  />
                  <ResourceFilters
                    value={state.filters.kind ?? "all"}
                    options={[
                      { value: "all", label: "全部" },
                      { value: "favorite", label: "收藏" },
                    ]}
                    onChange={(kind) => dispatch(actions.setFilters({ kind }))}
                  />
                </>
              }
              entries={page.items.map((row) => ({
                id: row.scenario.id,
                name: row.scenario.name,
                channel: row.scenario.channelId,
                favorite: row.scenario.favorite,
                description: `${row.channelName} · ${row.stepCount} 步 · v${row.scenario.revision ?? 1}`,
              }))}
              selectedId={state.selectedId}
              onSelect={(id) => {
                close();
                if (id !== state.draft?.id)
                  request(() => dispatch(actions.openScenario(id)));
              }}
              onContextMenu={setDeleting}
              page={page.page}
              pages={page.pages}
              filteredTotal={page.total}
              onPage={(value) => dispatch(actions.setPage(value))}
              onClear={() =>
                dispatch(
                  actions.setFilters({
                    query: "",
                    channel: "all",
                    kind: "all",
                  }),
                )
              }
            />
          )}
        >
          {state.draft ? (
            <ScenarioEditor key={state.draft.id} {...slots} />
          ) : (
            <div className="empty workspace-empty">
              <StudioIcon name="scenario" />
              <h3>选择一个剧本开始</h3>
              <StudioButton tone="soft" onClick={openCreate}>
                <StudioIcon name="plus" />
                新建
              </StudioButton>
            </div>
          )}
          {creating ? (
            <StudioDialog
              open
              title="新建剧本"
              description="先选平台。添加第一步后，平台锁定。"
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
                  <FieldLabel htmlFor="new-scenario-name">剧本名称</FieldLabel>
                  <Input
                    id="new-scenario-name"
                    autoFocus
                    maxLength={80}
                    placeholder="例如：从进入会话到商品咨询"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") create();
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-scenario-platform">
                    所属平台
                  </FieldLabel>
                  <select
                    id="new-scenario-platform"
                    value={channel}
                    onChange={(event) =>
                      setChannel(event.target.value as ChannelId)
                    }
                  >
                    {CHANNELS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
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
              label="剧本"
              name={
                state.items.find((item) => item.id === deleting)?.name ?? ""
              }
              onDelete={() => onDeleteScenario(deleting)}
              onClose={() => setDeleting(null)}
            />
          ) : null}
        </ResourceWorkspace>
      )}
    </DraftGuard>
  );
}
