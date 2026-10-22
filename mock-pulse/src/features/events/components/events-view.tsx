import { ArrowRightIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { ChannelPicker } from "@/components/channel-picker";
import { DraftGuard } from "@/components/draft-guard";
import { DeleteEntityDialog } from "@/components/entity-dialogs";
import { Notice } from "@/components/notice";
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
import {
  CHANNELS,
  type ChannelId,
  channelById,
  DEFAULT_CHANNEL,
} from "@/lib/channels";
import { latestVersion } from "../model";
import { schemaById, schemasByChannel } from "../schemas";
import { libraryRows, paginateEvents, templatesForChannel } from "../selectors";
import * as actions from "../stores/events-slice";
import { useEventDraftGuard } from "../use-event-draft-guard";
import { EventEditor, type EventEditorSlots } from "./event-editor";

/** 模板条目的列表 id 前缀：与用户素材 id（evt-*）区分命名空间 */
const TEMPLATE_ID_PREFIX = "template:";

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
  // 模板目录按渠道取自聚合注册表单点；未接入模板的渠道返回空表
  const templates = schemasByChannel(channel);
  const [schemaId, setSchema] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState("");
  const create = () => {
    if (!name.trim()) {
      setError("请填写事件名称。");
      return;
    }
    if (!schemaId) {
      setError("该平台还没有内置事件模板。");
      return;
    }
    dispatch(actions.startDraft({ name: name.trim(), schemaId }));
    onClose();
  };
  return (
    <WorkspaceDialog
      open
      title="新建事件"
      description="平台决定可用事件类型，保存后可在平台剧本中选择。"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} variant="outline">
            取消
          </Button>
          <Button variant="default" onClick={create}>
            <ArrowRightIcon aria-hidden="true" data-icon="inline-start" />
            开始编辑
          </Button>
        </>
      }
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="new-name">事件名称</FieldLabel>
          <Input
            id="new-name"
            autoFocus
            placeholder="例如：新用户第一次咨询"
            maxLength={80}
            value={name}
            aria-invalid={!!error}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                create();
              }
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="new-platform">所属平台</FieldLabel>
            <NativeSelect
              className="w-full"
              id="new-platform"
              value={channel}
              onChange={(event) => {
                const value = event.target.value as ChannelId;
                setChannel(value);
                setSchema(schemasByChannel(value)[0]?.id ?? "");
              }}
            >
              {CHANNELS.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="new-schema">事件类型</FieldLabel>
            {templates.length > 0 ? (
              <NativeSelect
                className="w-full"
                id="new-schema"
                value={schemaId}
                onChange={(event) => setSchema(event.target.value)}
              >
                {templates.map((schema) => (
                  <NativeSelectOption key={schema.id} value={schema.id}>
                    {schema.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <NativeSelect className="w-full" id="new-schema" disabled>
                <NativeSelectOption value="">
                  该平台暂无内置事件模板
                </NativeSelectOption>
              </NativeSelect>
            )}
          </Field>
        </FieldGroup>
      </FieldGroup>
    </WorkspaceDialog>
  );
}

export function EventsView({ slots }: { slots?: EventEditorSlots }) {
  const dispatch = useAppDispatch();
  const events = useAppSelector((state) => state.events);
  const guard = useEventDraftGuard();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  // 列表即目录（ADR-0009）：模板区随渠道筛选收敛，组合列表统一分页
  const templates = useMemo(
    () => templatesForChannel(events.filters.channel),
    [events.filters.channel],
  );
  const rows = useMemo(
    () => libraryRows(events.items, templates, events.filters),
    [events.items, templates, events.filters],
  );
  const page = paginateEvents(rows, events.page);
  return (
    <DraftGuard
      dirty={guard.dirty}
      name={guard.name}
      onSave={guard.save}
      onDiscard={guard.discard}
    >
      {(request) => (
        <>
          {events.hiddenUnregistered > 0 ? (
            <Notice className="mb-4">
              {events.hiddenUnregistered}{" "}
              条事件来自未注册的渠道版本，已在列表中隐藏；
              引用它们的剧本步骤会显示为缺失
            </Notice>
          ) : null}
          <ResourceWorkspace
            viewId="events"
            libraryLabel="事件素材"
            library={(close) => (
              <ResourceLibrary
                title="事件素材"
                singular="事件"
                total={events.items.length + templates.length}
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
                      onChange={(kind) =>
                        dispatch(actions.setFilters({ kind }))
                      }
                    />
                  </>
                }
                entries={page.items.map((row) =>
                  row.region === "template"
                    ? {
                        id: `${TEMPLATE_ID_PREFIX}${row.schema.id}`,
                        name: row.schema.name,
                        channel: row.schema.channelId,
                        badge: "内置",
                        group: row.schema.kind === "message" ? "消息" : "事件",
                        locked: true,
                        description: `${channelById(row.schema.channelId)?.name} · ${row.schema.eventName}`,
                      }
                    : {
                        id: row.item.id,
                        name: row.item.name,
                        channel: row.item.channelId,
                        favorite: row.item.favorite,
                        group: "已保存素材",
                        description: `${channelById(row.item.channelId)?.name} · ${row.schema?.name ?? row.item.schemaId} · v${latestVersion(row.item)?.revision ?? 1}`,
                      },
                )}
                selectedId={events.selectedId}
                onSelect={(id) => {
                  close();
                  if (id.startsWith(TEMPLATE_ID_PREFIX)) {
                    // 点模板 = 以模板开草稿（名字默认模板名），不产生落库实体
                    const schemaId = id.slice(TEMPLATE_ID_PREFIX.length);
                    const { name } = schemaById(schemaId);
                    request(() =>
                      dispatch(actions.startDraft({ name, schemaId })),
                    );
                    return;
                  }
                  if (id !== events.draft?.id)
                    request(() => dispatch(actions.openEvent(id)));
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
            {events.draft ? (
              <EventEditor key={events.draft.id} slots={slots} />
            ) : (
              <Empty className="min-h-60">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileTextIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>选择一个事件开始</EmptyTitle>
                  <EmptyDescription>
                    从素材库点开内置模板即改即发，或打开已保存的事件素材继续编辑。
                  </EmptyDescription>
                </EmptyHeader>
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  新建事件
                </Button>
              </Empty>
            )}
            {creating ? (
              <CreateEventDialog
                initialChannel={
                  events.filters.channel === "all"
                    ? DEFAULT_CHANNEL
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
        </>
      )}
    </DraftGuard>
  );
}
