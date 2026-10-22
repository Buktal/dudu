import { ArrowRightIcon, ListVideoIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { ChannelPicker } from "@/components/channel-picker";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { CHANNELS, type ChannelId, DEFAULT_CHANNEL } from "@/lib/channels";
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
  const [channel, setChannel] = useState<ChannelId>(DEFAULT_CHANNEL);
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
      state.filters.channel === "all" ? DEFAULT_CHANNEL : state.filters.channel,
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
              pagination={{
                page: page.page,
                pages: page.pages,
                filteredTotal: page.total,
                onPage: (value) => dispatch(actions.setPage(value)),
              }}
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
            <Empty className="min-h-60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListVideoIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>选择一个剧本开始</EmptyTitle>
                <EmptyDescription>
                  把同一平台的事件按顺序组合，复现完整的会话流程。
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="secondary" onClick={openCreate}>
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                新建剧本
              </Button>
            </Empty>
          )}
          {creating ? (
            <WorkspaceDialog
              open
              title="新建剧本"
              description="先选平台。添加第一步后，平台锁定。"
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
                  <FieldLabel htmlFor="new-scenario-name">剧本名称</FieldLabel>
                  <Input
                    id="new-scenario-name"
                    autoFocus
                    maxLength={80}
                    placeholder="例如：从进入会话到商品咨询"
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
                  <FieldLabel htmlFor="new-scenario-platform">
                    所属平台
                  </FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="new-scenario-platform"
                    value={channel}
                    onChange={(event) =>
                      setChannel(event.target.value as ChannelId)
                    }
                  >
                    {CHANNELS.map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </WorkspaceDialog>
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
