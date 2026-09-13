import { Fragment, type ReactNode, useState } from "react";
import { SaveAsDialog } from "@/components/entity-dialogs";
import {
  EntityHeader,
  IconButton,
  StudioButton,
  StudioDialog,
} from "@/components/studio-controls";
import { StudioIcon, type StudioIconName } from "@/components/studio-icon";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
      className="event-editor"
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
            <StudioButton tone="quiet" onClick={() => setCopying(true)}>
              另存为
            </StudioButton>
            <StudioButton
              tone={dirty ? "soft" : undefined}
              disabled={saving}
              onClick={() => void save()}
            >
              <StudioIcon name="save" />
              保存事件
            </StudioButton>
            {slots ? (
              <StudioButton
                tone={slots.dispatchSending ? "danger" : "primary"}
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
                <StudioIcon name={slots.dispatchSending ? "stop" : "play"} />
                {slots.dispatchStopping
                  ? "正在停止…"
                  : slots.dispatchSending
                    ? "停止运行"
                    : "发送一次"}
              </StudioButton>
            ) : null}
          </>
        }
      />
      <div className="route-strip">
        <span className="route-method">POST</span>
        <div className="route-line">
          <StudioIcon name="arrow" />
          <span className="route-target" title={connection?.url}>
            {connection?.url || "尚未设置回调地址"}
          </span>
        </div>
        <span className="route-extra">
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
        className="editor-tabs"
        aria-label="参数编辑方式"
      >
        <TabsTrigger
          value="form"
          className={cn("tab", tab === "form" && "active")}
        >
          字段编辑 <span className="count-inline">{fields.length}</span>
        </TabsTrigger>
        <TabsTrigger
          value="raw"
          className={cn("tab", tab === "raw" && "active")}
        >
          完整报文{" "}
          <span className="count-inline">{schema.wire.toUpperCase()}</span>
        </TabsTrigger>
        <TabsTrigger
          value="expect"
          className={cn("tab", tab === "expect" && "active")}
        >
          期望回执
        </TabsTrigger>
        <span className="grow" />
        <IconButton label="管理字段说明" onClick={() => setDictionary("")}>
          <StudioIcon name="book" />
        </IconButton>
      </TabsList>
      {error ? (
        <div role="alert" className="editor-error">
          {error}
        </div>
      ) : null}
      <TabsContent value="form" className="editor-scroll">
        <div className="parameters-toolbar">
          <div className="search">
            <StudioIcon name="search" />
            <Input
              aria-label="查找参数"
              placeholder="查找参数名称或路径"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="text-btn"
            onClick={() => setDictionary("")}
          >
            <StudioIcon name="book" />
            字段说明 <span className="type-hint">{schema.version}</span>
          </button>
        </div>
        {schema.wire === "xml" ? (
          <div className="info-line">
            <StudioIcon name="info" />
            <span>
              正在编辑加密前的 XML
              字段。此类自建应用回调没有昵称和头像字段，成员身份由 UserID 表示。
            </span>
          </div>
        ) : schema.contentString ? (
          <div className="info-line">
            <StudioIcon name="info" />
            <span>
              表单展开 content 便于编辑；完整报文仍保留该事件规定的字符串格式。
            </span>
          </div>
        ) : null}
        {groups.map((group) => (
          <section key={group} className="field-group">
            <div className="group-heading">
              <StudioIcon name={groupIcon(group)} />
              <h3>{group}</h3>
              <span className="group-count">
                {visible.filter((field) => field.group === group).length}
              </span>
              {group.includes("用户") &&
              draft.channelId === "douyin" &&
              getAt(draft.payload, "content.user_infos[0].open_id") !==
                undefined ? (
                <button
                  type="button"
                  className="text-btn group-aside"
                  onClick={() =>
                    dispatch(
                      actions.setDraftField({
                        path: "content.user_infos[0].open_id",
                        value: getAt(draft.payload, "from_user_id"),
                      }),
                    )
                  }
                >
                  同步两处用户 ID
                </button>
              ) : null}
            </div>
            <div className="field-grid-labels">
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
                    className="field-row"
                    data-invalid={!!input?.error}
                  >
                    <FieldLabel htmlFor={control.id}>
                      <span className="field-title">
                        {field.title}
                        {field.required ? (
                          <span className="required">*</span>
                        ) : null}
                      </span>
                      <span className="field-path" title={field.path}>
                        <FieldPath path={field.path} />
                      </span>
                    </FieldLabel>
                    <div className="field-value">
                      {field.type === "boolean" ? (
                        <select {...control}>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : field.multiline || field.type === "json" ? (
                        <Textarea {...control} rows={field.multiline ? 2 : 3} />
                      ) : (
                        <Input
                          {...control}
                          className={cn(
                            (field.format === "url" ||
                              field.path.toLowerCase().includes("id") ||
                              field.type === "number") &&
                              "path-value",
                          )}
                          type={field.type === "number" ? "number" : "text"}
                          step={field.type === "number" ? "any" : undefined}
                          spellCheck={false}
                        />
                      )}
                      {input?.error ? (
                        <span className="field-error">{input.error}</span>
                      ) : null}
                    </div>
                    <div
                      className="field-description"
                      id={`desc-${field.path}`}
                    >
                      {field.description}
                      {field.unknown ? (
                        <>
                          <br />
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => setDictionary(field.path)}
                          >
                            补充说明
                          </button>
                        </>
                      ) : null}
                    </div>
                  </Field>
                );
              })}
          </section>
        ))}
        {!groups.length ? (
          <div className="empty">
            <StudioIcon name="search" />
            <h3>没有找到这个字段</h3>
            <p>试试字段路径或中文名称。</p>
          </div>
        ) : null}
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setCustomPath("");
            setCustomValue("");
            setCustomField(true);
          }}
        >
          <StudioIcon name="plus" />
          添加自定义参数
        </button>
      </TabsContent>
      <TabsContent value="raw" className="editor-scroll">
        <div className="raw-toolbar">
          <span className="pill">
            {schema.wire === "xml" ? "加密前的 XML" : "平台原始 JSON"}
          </span>
          <span className="grow" />
          <StudioButton
            small
            tone="quiet"
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
          </StudioButton>
          <StudioButton small tone="soft" onClick={applyRaw}>
            <StudioIcon name="check" />
            应用到字段
          </StudioButton>
        </div>
        <Textarea
          className="raw-editor"
          aria-label={`完整${schema.wire.toUpperCase()}报文`}
          spellCheck={false}
          value={raw}
          onChange={(event) =>
            dispatch(actions.setDraftRawText(event.target.value))
          }
        />
        <div className="raw-note">
          字段编辑与完整报文共享同一份参数。新增字段会保留，已有说明的字段自动显示中文含义。
        </div>
      </TabsContent>
      <TabsContent value="expect" className="editor-scroll">
        <div className="stack">
          <div className="info-line">
            <StudioIcon name="info" />
            <span>
              发送时，将回执与这里的期望对照。空白响应正文表示只检查 HTTP 状态。
            </span>
          </div>
          <FieldGroup className="settings-grid">
            <Field className="settings-field">
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
            <Field className="settings-field full-width">
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
            <Field className="settings-field">
              <FieldLabel htmlFor="expected-mode">正文比对方式</FieldLabel>
              <select
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
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
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
        <StudioDialog
          open
          title="添加自定义参数"
          description="新增字段会保留在完整报文中，也可以补充字段说明。"
          onClose={() => setCustomField(false)}
          footer={
            <>
              <StudioButton onClick={() => setCustomField(false)}>
                取消
              </StudioButton>
              <StudioButton
                tone="primary"
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
                <StudioIcon name="plus" />
                添加参数
              </StudioButton>
            </>
          }
        >
          <FieldGroup className="modal-fields">
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
              <select
                id="custom-type"
                value={customType}
                onChange={(event) => setCustomType(event.target.value)}
              >
                <option value="string">文本</option>
                <option value="json">JSON 值</option>
              </select>
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
            <p role="alert" className="modal-inline-error">
              {error}
            </p>
          ) : null}
        </StudioDialog>
      ) : null}
    </Tabs>
  );
}
