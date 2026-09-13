import { useMemo, useState } from "react";
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
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { latestVersion } from "../model";
import { DOUYIN_EVENT_SCHEMAS, WECOM_EVENT_SCHEMAS } from "../schemas";
import { filterEvents, paginateEvents } from "../selectors";
import * as actions from "../stores/events-slice";
import { EventEditor, type EventEditorSlots } from "./event-editor";

function CreateEventDialog({
  initialChannel,
  onClose,
}: {
  initialChannel: ChannelId;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState(initialChannel);
  const templates =
    channel === "douyin" ? DOUYIN_EVENT_SCHEMAS : WECOM_EVENT_SCHEMAS;
  const [schemaId, setSchema] = useState(templates[0].id);
  const [error, setError] = useState("");
  const create = () => {
    if (!name.trim()) {
      setError("请填写事件名称。");
      return;
    }
    dispatch(actions.startDraft({ name: name.trim(), schemaId }));
    onClose();
  };
  return (
    <StudioDialog
      open
      title="新建事件"
      description="平台决定可用事件类型，保存后可在平台剧本中选择。"
      onClose={onClose}
      footer={
        <>
          <StudioButton onClick={onClose}>取消</StudioButton>
          <StudioButton tone="primary" onClick={create}>
            <StudioIcon name="arrow" />
            开始编辑
          </StudioButton>
        </>
      }
    >
      <FieldGroup className="modal-fields">
        <Field>
          <FieldLabel htmlFor="new-name">事件名称</FieldLabel>
          <Input
            id="new-name"
            autoFocus
            placeholder="例如：新用户第一次咨询"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
          />
        </Field>
        <div className="row gap16">
          <Field>
            <FieldLabel htmlFor="new-platform">所属平台</FieldLabel>
            <select
              id="new-platform"
              value={channel}
              onChange={(event) => {
                const value = event.target.value as ChannelId;
                setChannel(value);
                setSchema(
                  (value === "douyin"
                    ? DOUYIN_EVENT_SCHEMAS
                    : WECOM_EVENT_SCHEMAS)[0].id,
                );
              }}
            >
              {CHANNELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="new-schema">事件类型</FieldLabel>
            <select
              id="new-schema"
              value={schemaId}
              onChange={(event) => setSchema(event.target.value)}
            >
              {templates.map((schema) => (
                <option key={schema.id} value={schema.id}>
                  {schema.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FieldGroup>
      {error ? (
        <p className="modal-inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </StudioDialog>
  );
}

export function EventsView({ slots }: { slots?: EventEditorSlots }) {
  const dispatch = useAppDispatch();
  const events = useAppSelector((state) => state.events);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const rows = useMemo(
    () => filterEvents(events.items, events.filters),
    [events.items, events.filters],
  );
  const page = paginateEvents(rows, events.page);
  return (
    <DraftGuard
      dirty={actions.selectDraftDirty(events)}
      name={events.draft?.name ?? ""}
      onSave={() => dispatch(actions.saveEvent()).unwrap()}
      onDiscard={() => dispatch(actions.discardDraft())}
    >
      {(request) => (
        <ResourceWorkspace
          viewId="events"
          libraryLabel="事件样例"
          library={(close) => (
            <ResourceLibrary
              title="事件样例"
              singular="事件"
              total={events.items.length}
              query={events.filters.query}
              onQuery={(query) => dispatch(actions.setFilters({ query }))}
              onCreate={() => {
                close();
                request(() => setCreating(true));
              }}
              filters={
                <>
                  <ChannelPicker
                    allowAll
                    value={events.filters.channel}
                    onSelect={(channel) =>
                      dispatch(actions.setFilters({ channel }))
                    }
                  />
                  <ResourceFilters
                    value={events.filters.kind}
                    options={[
                      { value: "all", label: "全部" },
                      { value: "message", label: "消息" },
                      { value: "event", label: "事件" },
                      { value: "favorite", label: "收藏" },
                    ]}
                    onChange={(kind) => dispatch(actions.setFilters({ kind }))}
                  />
                </>
              }
              entries={page.items.map(({ item, schema }) => ({
                id: item.id,
                name: item.name,
                channel: item.channelId,
                favorite: item.favorite,
                description: `${channelById(item.channelId)?.name} · ${schema?.name ?? item.schemaId} · v${latestVersion(item)?.revision ?? 1}`,
              }))}
              selectedId={events.selectedId}
              onSelect={(id) => {
                close();
                if (id !== events.draft?.id)
                  request(() => dispatch(actions.openEvent(id)));
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
          {events.draft ? (
            <EventEditor key={events.draft.id} slots={slots} />
          ) : (
            <div className="empty workspace-empty">
              <StudioIcon name="event" />
              <h3>选择一个事件开始</h3>
              <StudioButton tone="soft" onClick={() => setCreating(true)}>
                <StudioIcon name="plus" />
                新建
              </StudioButton>
            </div>
          )}
          {creating ? (
            <CreateEventDialog
              initialChannel={
                events.filters.channel === "all"
                  ? "douyin"
                  : events.filters.channel
              }
              onClose={() => setCreating(false)}
            />
          ) : null}
          {deleting ? (
            <DeleteEntityDialog
              label="事件"
              name={
                events.items.find((item) => item.id === deleting)?.name ?? ""
              }
              onClose={() => setDeleting(null)}
              onDelete={() =>
                slots
                  ? slots.onDeleteEvent(deleting)
                  : dispatch(actions.deleteEvent(deleting)).unwrap()
              }
            />
          ) : null}
        </ResourceWorkspace>
      )}
    </DraftGuard>
  );
}
