import { Fragment, type ReactNode, useState } from "react";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { SearchInput } from "@/components/search-input";
import { StudioIcon, type StudioIconName } from "@/components/studio-icon";
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
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { selectConnection, setConnectionChannel } from "@/features/connections";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { setView } from "@/stores/app-slice";
import { resolveEditorFields } from "../definitions/resolve";
import { latestVersion, type ReceiptBodyMode } from "../model";
import {
  getAt,
  parseWireDraft,
  wireDraftText,
  withCustomField,
} from "../payload";
import { RECEIPT_BODY_MODES } from "../receipt";
import { schemaById } from "../schemas";
import * as actions from "../stores/events-slice";
import { DictionaryDialog } from "./dictionary-dialog";

export type EventEditorSlots = {
  onDirectDispatch: () => void;
  dispatchSending: boolean;
  dispatchDisabled?: boolean;
  dispatchStopping?: boolean;
  footer: ReactNode;
  referencingScenarioNames: string[];
  onDeleteEvent: (eventId: string) => Promise<void>;
  onStopDispatch?: () => void;
};
type TabKey = "form" | "raw" | "expect";

function FieldPath({ path }: { path: string }) {
  let prefix = "";
  return path.split(".").map((part) => {
    prefix = prefix ? `${prefix}.${part}` : part;
    return (
      <Fragment key={prefix}>
        {part}
        {prefix.length < path.length ? (
          <>
            .<wbr />
          </>
        ) : null}
      </Fragment>
    );
  });
}

export function EventEditor({ slots }: { slots?: EventEditorSlots }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.events);
  const draft = state.draft;
  const connection = useAppSelector((root) =>
    draft ? selectConnection(root.connections, draft.channelId) : undefined,
  );
  const [tab, setTab] = useState<TabKey>("form");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [dictionary, setDictionary] = useState<string | null>(null);
  const [customField, setCustomField] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customType, setCustomType] = useState("string");
  if (!draft) return null;
  const schema = schemaById(draft.schemaId);
  const event = state.items.find((item) => item.id === draft.id);
  const latest = event && latestVersion(event);
  const definition = actions.selectSchemaUserDefinition(state, draft.schemaId);
  const fields = resolveEditorFields(schema, definition?.fields, draft.payload);
  const visible = fields.filter((field) =>
    `${field.title} ${field.path} ${field.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = [...new Set(visible.map((field) => field.group))];
  const dirty = actions.selectDraftDirty(state);
  const raw = state.rawText ?? wireDraftText(schema, draft.payload);
  const applyRaw = () => {
    try {
      dispatch(actions.setDraftPayload(parseWireDraft(schema, raw)));
      setError("");
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };
  const changeTab = (value: TabKey) => {
    if (tab === "raw" && state.rawText != null && !applyRaw()) return;
    setTab(value);
  };
  const save = async () => {
    if (state.rawText != null && !applyRaw()) {
      setTab("raw");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(actions.saveEvent()).unwrap();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const editField = (path: string, text: string, type: string) =>
    dispatch(actions.editFieldText({ path, text, type }));
  const groupIcon = (group: string): StudioIconName =>
    group.includes("用户")
      ? "user"
      : group.includes("消息")
        ? "message"
        : group.includes("时序") || group.includes("时间")
          ? "clock"
          : "hash";
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => changeTab(value as TabKey)}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <EntityHeader
        name={draft.name}
        label="事件"
        onNameChange={(name) => dispatch(actions.setDraftName(name))}
        channel={draft.channelId}
        kicker={schema.name}
        dirty={dirty}
        saved={!!event}
        revision={latest?.revision}
        favorite={draft.favorite}
        onFavorite={() => dispatch(actions.toggleEventFavorite())}
        actions={
          <>
            <Button variant="ghost" onClick={() => setCopying(true)}>
              另存为
            </Button>
            <Button
              variant={dirty ? "secondary" : "outline"}
              disabled={saving}
              onClick={() => void save()}
            >
              <StudioIcon name="save" data-icon="inline-start" />
              保存事件
            </Button>
            {slots ? (
              <Button
                variant={slots.dispatchSending ? "destructive" : "default"}
                disabled={
                  slots.dispatchSending
                    ? slots.dispatchStopping || !slots.onStopDispatch
                    : slots.dispatchDisabled
                }
                onClick={() => {
                  if (slots.dispatchSending) {
                    slots.onStopDispatch?.();
                    return;
                  }
                  if (state.rawText != null && !applyRaw()) {
                    setTab("raw");
                    return;
                  }
                  slots.onDirectDispatch();
                }}
              >
                <StudioIcon
                  name={slots.dispatchSending ? "stop" : "play"}
                  data-icon="inline-start"
                />
                {slots.dispatchStopping
                  ? "正在停止…"
                  : slots.dispatchSending
                    ? "停止运行"
                    : "发送一次"}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mx-4 mb-4 flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 lg:mx-6">
        <span className="font-mono text-xs font-medium text-success">POST</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 font-mono text-xs text-muted-foreground">
          <StudioIcon name="arrow" />
          <span className="truncate" title={connection?.url}>
            {connection?.url || "尚未设置回调地址"}
          </span>
        </div>
        <span className="hidden text-xs text-muted-foreground xl:inline">
          {schema.wire === "xml" ? "XML · 加密前编辑" : "JSON · 原始平台字段"}
        </span>
        <IconButton
          label="配置该平台目标地址"
          onClick={() => {
            dispatch(setConnectionChannel(draft.channelId));
            dispatch(setView("connections"));
          }}
        >
          <StudioIcon name="settings" />
        </IconButton>
      </div>
      <TabsList
        variant="line"
        className="flex shrink-0 items-center gap-3 border-b px-4 py-2 lg:px-6"
        aria-label="参数编辑方式"
      >
        <TabsTrigger
          value="form"
          className={cn("flex items-center gap-2", tab === "form" && "")}
        >
          字段编辑{" "}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {fields.length}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="raw"
          className={cn("flex items-center gap-2", tab === "raw" && "")}
        >
          完整报文{" "}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {schema.wire.toUpperCase()}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="expect"
          className={cn("flex items-center gap-2", tab === "expect" && "")}
        >
          期望回执
        </TabsTrigger>
        <span className="min-w-0 flex-1" />
        <IconButton label="管理字段说明" onClick={() => setDictionary("")}>
          <StudioIcon name="book" />
        </IconButton>
      </TabsList>
      {error ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error}
        </Notice>
      ) : null}
      <TabsContent
        value="form"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SearchInput
              aria-label="查找参数"
              placeholder="查找参数名称或路径"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="h-auto p-0 "
            onClick={() => setDictionary("")}
            variant="link"
          >
            <StudioIcon name="book" />
            字段说明{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {schema.version}
            </span>
          </Button>
        </div>
        {schema.wire === "xml" ? (
          <Notice className="mb-4">
            <StudioIcon name="info" />
            <span>
              正在编辑加密前的 XML
              字段。此类自建应用回调没有昵称和头像字段，成员身份由 UserID 表示。
            </span>
          </Notice>
        ) : schema.contentString ? (
          <Notice className="mb-4">
            <StudioIcon name="info" />
            <span>
              表单展开 content 便于编辑；完整报文仍保留该事件规定的字符串格式。
            </span>
          </Notice>
        ) : null}
        {groups.map((group) => (
          <section key={group} className="mb-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <StudioIcon name={groupIcon(group)} />
              <h3>{group}</h3>
              <span className="font-mono text-xs text-muted-foreground">
                {visible.filter((field) => field.group === group).length}
              </span>
              {group.includes("用户") &&
              draft.channelId === "douyin" &&
              getAt(draft.payload, "content.user_infos[0].open_id") !==
                undefined ? (
                <Button
                  type="button"
                  className="h-auto p-0 ml-auto"
                  onClick={() =>
                    dispatch(
                      actions.setDraftField({
                        path: "content.user_infos[0].open_id",
                        value: getAt(draft.payload, "from_user_id"),
                      }),
                    )
                  }
                  variant="link"
                >
                  同步两处用户 ID
                </Button>
              ) : null}
            </div>
            <div className="hidden grid-cols-[10rem_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 text-xs text-muted-foreground @3xl/workspace:grid">
              <span>参数</span>
              <span>值</span>
              <span>字段含义</span>
            </div>
            {visible
              .filter((field) => field.group === group)
              .map((field) => {
                const input = state.fieldInputs?.[field.path];
                const value =
                  input?.text ??
                  (field.type === "json"
                    ? JSON.stringify(field.value, null, 2)
                    : String(field.value ?? ""));
                const control = {
                  id: `field-${field.path}`,
                  "aria-label": field.title,
                  "aria-describedby": `desc-${field.path}`,
                  "aria-invalid": !!input?.error,
                  value,
                  onChange: (event: { target: { value: string } }) =>
                    editField(field.path, event.target.value, field.type),
                };
                return (
                  <Field
                    key={field.path}
                    className="grid grid-cols-1 gap-3 border-b py-4 @md/workspace:grid-cols-[9rem_minmax(0,1fr)] @3xl/workspace:grid-cols-[10rem_minmax(0,1.2fr)_minmax(0,1fr)]"
                    data-invalid={!!input?.error}
                  >
                    <FieldLabel htmlFor={control.id}>
                      <span className="flex items-center gap-1">
                        {field.title}
                        {field.required ? (
                          <span className="text-muted-foreground">*</span>
                        ) : null}
                      </span>
                      <span
                        className="block font-mono text-xs leading-relaxed text-muted-foreground wrap-anywhere"
                        title={field.path}
                      >
                        <FieldPath path={field.path} />
                      </span>
                    </FieldLabel>
                    <div className="flex min-w-0 flex-col gap-2">
                      {field.type === "boolean" ? (
                        <NativeSelect {...control}>
                          <NativeSelectOption value="true">
                            true
                          </NativeSelectOption>
                          <NativeSelectOption value="false">
                            false
                          </NativeSelectOption>
                        </NativeSelect>
                      ) : field.multiline || field.type === "json" ? (
                        <Textarea {...control} rows={field.multiline ? 2 : 3} />
                      ) : (
                        <Input
                          {...control}
                          className={cn(
                            (field.format === "url" ||
                              field.path.toLowerCase().includes("id") ||
                              field.type === "number") &&
                              "",
                          )}
                          type={field.type === "number" ? "number" : "text"}
                          step={field.type === "number" ? "any" : undefined}
                          spellCheck={false}
                        />
                      )}
                      {input?.error ? (
                        <span className="text-sm text-destructive">
                          {input.error}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="text-sm leading-relaxed text-muted-foreground @md/workspace:col-start-2 @3xl/workspace:col-start-auto"
                      id={`desc-${field.path}`}
                    >
                      {field.description}
                      {field.unknown ? (
                        <>
                          <br />
                          <Button
                            type="button"
                            className="h-auto p-0 "
                            onClick={() => setDictionary(field.path)}
                            variant="link"
                          >
                            补充说明
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </Field>
                );
              })}
          </section>
        ))}
        {!groups.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StudioIcon name="search" />
              </EmptyMedia>
              <EmptyTitle>没有找到这个字段</EmptyTitle>
              <EmptyDescription>试试字段路径或中文名称。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        <Button
          type="button"
          className="h-auto p-0 "
          onClick={() => {
            setCustomPath("");
            setCustomValue("");
            setCustomField(true);
          }}
          variant="link"
        >
          <StudioIcon name="plus" />
          添加自定义参数
        </Button>
      </TabsContent>
      <TabsContent
        value="raw"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {schema.wire === "xml" ? "加密前的 XML" : "平台原始 JSON"}
          </Badge>
          <span className="min-w-0 flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              try {
                dispatch(
                  actions.setDraftRawText(
                    wireDraftText(schema, parseWireDraft(schema, raw)),
                  ),
                );
                setError("");
              } catch (cause) {
                setError(errorMessage(cause));
              }
            }}
          >
            格式化
          </Button>
          <Button size="sm" variant="secondary" onClick={applyRaw}>
            <StudioIcon name="check" data-icon="inline-start" />
            应用到字段
          </Button>
        </div>
        <Textarea
          className="min-h-80 resize-y"
          aria-label={`完整${schema.wire.toUpperCase()}报文`}
          spellCheck={false}
          value={raw}
          onChange={(event) =>
            dispatch(actions.setDraftRawText(event.target.value))
          }
        />
        <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
          字段编辑与完整报文共享同一份参数。新增字段会保留，已有说明的字段自动显示中文含义。
        </div>
      </TabsContent>
      <TabsContent
        value="expect"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6"
      >
        <div className="flex flex-col gap-4">
          <Notice className="mb-4">
            <StudioIcon name="info" />
            <span>
              发送时，将回执与这里的期望对照。空白响应正文表示只检查 HTTP 状态。
            </span>
          </Notice>
          <FieldGroup className="grid grid-cols-1 gap-5 @xl/workspace:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel htmlFor="expected-status">期望 HTTP 状态</FieldLabel>
              <Input
                id="expected-status"
                type="number"
                min={100}
                max={599}
                value={draft.expected.status}
                onChange={(event) =>
                  dispatch(
                    actions.setDraftExpected({
                      status: Number(event.target.value),
                    }),
                  )
                }
              />
            </Field>
            <Field className="min-w-0 col-span-full">
              <FieldLabel htmlFor="expected-body">期望响应正文</FieldLabel>
              <Textarea
                id="expected-body"
                rows={4}
                placeholder="留空时不校验正文"
                value={draft.expected.body}
                onChange={(event) =>
                  dispatch(
                    actions.setDraftExpected({ body: event.target.value }),
                  )
                }
              />
              <small>留空时只检查 HTTP 状态，正文按下方方式比对。</small>
            </Field>
            <Field className="min-w-0">
              <FieldLabel htmlFor="expected-mode">正文比对方式</FieldLabel>
              <NativeSelect
                id="expected-mode"
                value={draft.expected.bodyMode}
                onChange={(event) =>
                  dispatch(
                    actions.setDraftExpected({
                      bodyMode: event.target.value as ReceiptBodyMode,
                    }),
                  )
                }
              >
                {RECEIPT_BODY_MODES.map((mode) => (
                  <NativeSelectOption key={mode.id} value={mode.id}>
                    {mode.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <small>
                {
                  RECEIPT_BODY_MODES.find(
                    (mode) => mode.id === draft.expected.bodyMode,
                  )?.hint
                }
              </small>
            </Field>
          </FieldGroup>
        </div>
      </TabsContent>
      {slots?.footer}
      {copying ? (
        <SaveAsDialog
          label="事件"
          name={draft.name}
          onSave={(name) => dispatch(actions.saveEventAs(name)).unwrap()}
          onClose={() => setCopying(false)}
        />
      ) : null}
      {dictionary !== null ? (
        <DictionaryDialog
          schema={schema}
          payload={draft.payload}
          userDefinition={definition}
          initialPath={dictionary || null}
          onClose={() => setDictionary(null)}
        />
      ) : null}
      {customField ? (
        <WorkspaceDialog
          open
          title="添加自定义参数"
          description="新增字段会保留在完整报文中，也可以补充字段说明。"
          onClose={() => setCustomField(false)}
          footer={
            <>
              <Button onClick={() => setCustomField(false)} variant="outline">
                取消
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  try {
                    const value =
                      customType === "string"
                        ? customValue
                        : JSON.parse(customValue);
                    dispatch(
                      actions.setDraftPayload(
                        withCustomField(
                          schema,
                          draft.payload,
                          customPath,
                          value,
                        ),
                      ),
                    );
                    setError("");
                    setCustomField(false);
                  } catch (cause) {
                    setError(errorMessage(cause));
                  }
                }}
              >
                <StudioIcon name="plus" data-icon="inline-start" />
                添加参数
              </Button>
            </>
          }
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="custom-path">字段路径</FieldLabel>
              <Input
                id="custom-path"
                placeholder="例如：content.extra"
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-type">值类型</FieldLabel>
              <NativeSelect
                id="custom-type"
                value={customType}
                onChange={(event) => setCustomType(event.target.value)}
              >
                <NativeSelectOption value="string">文本</NativeSelectOption>
                <NativeSelectOption value="json">JSON 值</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="custom-value">参数值</FieldLabel>
              <Textarea
                id="custom-value"
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <Notice role="alert" className="mb-4" variant="destructive">
              {error}
            </Notice>
          ) : null}
        </WorkspaceDialog>
      ) : null}
    </Tabs>
  );
}
