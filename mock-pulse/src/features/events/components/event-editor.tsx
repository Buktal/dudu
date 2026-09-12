import {
  Copy,
  Eye,
  Info,
  Loader2,
  Save,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  clearDispatch,
  DispatchPanel,
  directDispatch,
  selectPanelPhase,
} from "@/features/runs";
import {
  deleteEventGuarded,
  scenarioNamesReferencingEvent,
} from "@/features/scenarios";
import { channelById } from "@/lib/channels";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { AppDispatch, RootState } from "@/store";
import {
  type EventItem,
  type EventVersion,
  isDraftDirty,
  latestVersion,
} from "../model";
import {
  type EditorField,
  getAt,
  parseWireDraft,
  resolveEditorFields,
  wireDraftText,
} from "../payload";
import { describeExpected, RECEIPT_BODY_MODES } from "../receipt";
import { type EventSchema, schemaById } from "../schemas";
import {
  discardDraft,
  duplicateCurrentDraft,
  renameEvent,
  saveEvent,
  setDraftExpected,
  setDraftField,
  setDraftName,
  setDraftPayload,
  toggleSenderSync,
} from "../stores/events-slice";

type TabKey = "form" | "raw" | "expect" | "versions";

const TABS: { key: TabKey; label: string }[] = [
  { key: "form", label: "字段编辑" },
  { key: "raw", label: "完整报文" },
  { key: "expect", label: "期望回执" },
  { key: "versions", label: "版本历史" },
];

function fieldControl(
  field: EditorField,
  onEdit: (value: unknown) => void,
): React.ReactNode {
  if (field.type === "json") {
    return (
      <Input
        readOnly
        aria-label={field.title}
        className="h-8 font-mono text-[11px]"
        value={
          field.value === undefined
            ? ""
            : (JSON.stringify(field.value) ?? "null")
        }
      />
    );
  }
  if (field.multiline) {
    return (
      <Textarea
        aria-label={field.title}
        className="min-h-16 font-mono text-xs"
        spellCheck={false}
        value={(field.value as string | undefined) ?? ""}
        onChange={(event) => onEdit(event.target.value)}
      />
    );
  }
  const value =
    field.value === undefined || field.value === null
      ? ""
      : String(field.value);
  // numberString：64 位整型等大数字按文本输入处理，全程字符串不经 Number
  return (
    <Input
      aria-label={field.title}
      type={field.type === "number" ? "number" : "text"}
      className={cn(
        "h-8 text-xs",
        field.format === "url" && "font-mono text-[11px]",
        field.type === "numberString" && "font-mono text-[11px]",
      )}
      spellCheck={false}
      value={value}
      onChange={(event) =>
        onEdit(
          field.type === "number" && event.target.value !== ""
            ? Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

function FieldRows({
  fields,
  onEdit,
}: {
  fields: EditorField[];
  onEdit: (path: string, value: unknown) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_minmax(140px,260px)] gap-x-4 gap-y-1">
      {fields.map((field) => (
        <div key={field.path} className="col-span-3 grid grid-cols-subgrid">
          <div className="py-1.5">
            <Label className="text-[11px] leading-tight font-medium">
              {field.title}
              {field.required ? (
                <span className="ml-0.5 text-destructive">*</span>
              ) : null}
              {field.unknown ? (
                <Badge
                  variant="outline"
                  className="ml-1.5 h-4 px-1 font-mono text-[8px]"
                >
                  待补充说明
                </Badge>
              ) : null}
            </Label>
            <p
              className="mt-0.5 font-mono text-[9px] break-all text-muted-foreground/80"
              title={field.path}
            >
              {field.path}
            </p>
          </div>
          <div className="py-0.5">
            {fieldControl(field, (value) => onEdit(field.path, value))}
          </div>
          <p className="py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {field.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function VersionJson({
  version,
  schema,
}: {
  version: EventVersion;
  schema: EventSchema;
}) {
  const text =
    schema.wire === "xml"
      ? wireDraftText(schema, version.payload)
      : JSON.stringify(version.payload, null, 2);
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[10px] leading-relaxed text-foreground">
      {text}
    </pre>
  );
}

/** 事件编辑器：字段编辑 / 完整报文 / 期望回执 / 版本历史 共享同一份草稿 */
export function EventEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const draft = useSelector((state: RootState) => state.events.draft);
  const items = useSelector((state: RootState) => state.events.items);
  const referencingScenarios = useSelector((state: RootState) =>
    draft ? scenarioNamesReferencingEvent(state, draft.id) : [],
  );
  const dispatchPhase = useSelector((state: RootState) =>
    selectPanelPhase(state.runs),
  );
  const [tab, setTab] = useState<TabKey>("form");
  const [fieldQuery, setFieldQuery] = useState("");
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState("");
  const [applied, setApplied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewRevision, setViewRevision] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const event: EventItem | null = useMemo(
    () => (draft ? (items.find((item) => item.id === draft.id) ?? null) : null),
    [items, draft],
  );

  const schema = useMemo(
    () => (draft ? schemaById(draft.schemaId) : null),
    [draft],
  );

  const dirty = useMemo(
    () => (draft && schema ? isDraftDirty(event, draft) : false),
    [event, draft, schema],
  );

  const latest = event ? latestVersion(event) : undefined;
  const channel = draft ? channelById(draft.channelId) : undefined;
  const senderProfileExists =
    draft && schema
      ? getAt(draft.payload, "content.user_infos[0].open_id") !== undefined
      : false;

  const wireText = useMemo(() => {
    if (!draft || !schema) return "";
    // 报文页文本：抖音 = 2 空格缩进 JSON；企微 = 线上 XML 明文原文
    return wireDraftText(schema, draft.payload);
  }, [draft, schema]);

  useEffect(() => {
    if (tab === "raw") {
      setRawText(wireText);
      setRawError("");
      setApplied(false);
    }
  }, [tab, wireText]);

  // 切换编辑对象时复位本地编辑态（按 id 触发）+ 清空直发面板
  const draftId = draft?.id ?? null;
  useEffect(() => {
    if (!draftId) return;
    setTab("form");
    setFieldQuery("");
    setConfirmDelete(false);
    setViewRevision(null);
    dispatch(clearDispatch());
  }, [draftId, dispatch]);

  const applyRaw = (): boolean => {
    if (!schema) return false;
    try {
      const parsed = parseWireDraft(schema, rawText);
      dispatch(setDraftPayload(parsed));
      setRawError("");
      setApplied(true);
      return true;
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "报文解析失败。");
      return false;
    }
  };

  const switchTab = (next: TabKey) => {
    if (tab === "raw" && next !== "raw" && rawText !== wireText) {
      if (!applyRaw()) return;
    }
    setTab(next);
  };

  const onSave = async () => {
    // 完整报文页有未应用的修改时，先应用再保存；解析失败则留在原页
    if (tab === "raw" && rawText !== wireText && !applyRaw()) {
      return;
    }
    setSaving(true);
    try {
      await dispatch(saveEvent());
    } finally {
      setSaving(false);
    }
  };

  if (!draft || !schema) return null;

  const fields = resolveEditorFields(schema, draft.payload);
  const query = fieldQuery.trim().toLowerCase();
  const visibleFields = query
    ? fields.filter((field) =>
        `${field.title} ${field.path} ${field.description}`
          .toLowerCase()
          .includes(query),
      )
    : fields;
  const groups = [...new Set(visibleFields.map((field) => field.group))];
  const versionsDesc = event ? [...event.versions].reverse() : [];
  const viewing =
    event && viewRevision !== null
      ? event.versions.find((version) => version.revision === viewRevision)
      : undefined;

  const onEdit = (path: string, value: unknown) =>
    dispatch(setDraftField({ path, value }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none flex-col gap-3 border-b border-border px-6 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label="事件名称"
            className="h-9 w-72 border-transparent bg-transparent px-0 font-heading text-lg font-semibold shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-2"
            value={draft.name}
            onChange={(change) => dispatch(setDraftName(change.target.value))}
          />
          <span className="grow" />
          {event && event.name !== draft.name ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                dispatch(
                  renameEvent({
                    id: draft.id,
                    name: draft.name.trim() || event.name,
                  }),
                )
              }
            >
              重命名
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatch(duplicateCurrentDraft())}
          >
            <Copy className="size-3.5" aria-hidden />
            复制
          </Button>
          {event ? (
            confirmDelete ? (
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmDelete(false);
                    // 领域层守卫：被剧本引用时拒绝删除（可读错误）
                    void dispatch(deleteEventGuarded(draft.id));
                  }}
                >
                  确认删除
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </Button>
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={referencingScenarios.length > 0}
                title={
                  referencingScenarios.length > 0
                    ? `事件被剧本引用：${referencingScenarios.join("、")}。先删除或调整剧本，再删除事件。`
                    : undefined
                }
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                删除
              </Button>
            )
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch(discardDraft())}
            >
              放弃草稿
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || saving}
            onClick={() => void onSave()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            保存新版本
          </Button>
          <Button
            size="sm"
            disabled={dispatchPhase === "sending"}
            onClick={() => void dispatch(directDispatch())}
          >
            {dispatchPhase === "sending" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            直接发送
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <Badge variant="secondary" className="font-mono text-[9px]">
            {channel?.name ?? draft.channelId}
          </Badge>
          <Badge variant="outline" className="font-mono text-[9px]">
            {schema.name}
          </Badge>
          <Badge variant="outline" className="font-mono text-[9px]">
            {schema.eventName}
          </Badge>
          <span className="font-mono">
            {latest ? `v${latest.revision}` : "未保存"}
          </span>
          {event ? (
            <span>
              · {event.versions.length} 个版本 · 保存于{" "}
              {formatDateTime(latest?.savedAt)}
            </span>
          ) : (
            <span>· 尚未进入素材库</span>
          )}
          {dirty ? (
            <span className="flex items-center gap-1 text-primary">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              有未保存的修改
            </span>
          ) : null}
          {referencingScenarios.length > 0 ? (
            <span title="被剧本引用的事件不能删除，先删除或调整剧本">
              · 被剧本引用：{referencingScenarios.join("、")}
            </span>
          ) : null}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="编辑方式"
        className="flex flex-none gap-1 border-b border-border px-6"
      >
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => switchTab(entry.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === entry.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            {entry.key === "form" ? (
              <span className="ml-1.5 font-mono text-[9px] text-muted-foreground">
                {fields.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === "form" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  aria-label="查找参数"
                  className="h-8 pl-8 text-xs"
                  placeholder="查找参数名称或路径"
                  value={fieldQuery}
                  onChange={(change) => setFieldQuery(change.target.value)}
                />
              </div>
              <span className="grow" />
              <a
                href={schema.source}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                字段说明来源 · 官方文档
              </a>
              <span className="font-mono text-[9px] text-muted-foreground">
                描述符 {schema.version}
              </span>
            </div>

            {schema.contentString ? (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                表单展开 content
                便于编辑；完整报文仍保留该事件规定的字符串格式。
              </p>
            ) : null}

            {visibleFields.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Search className="size-5 text-muted-foreground" aria-hidden />
                <p className="text-xs font-medium text-foreground">
                  没有找到这个字段
                </p>
                <p className="text-[10px] text-muted-foreground">
                  试试字段路径或中文名称。
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <section key={group} className="space-y-2">
                  <div className="flex items-center gap-2 border-b border-border pb-1.5">
                    <h3 className="text-[11px] font-semibold text-foreground">
                      {group}
                    </h3>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {
                        visibleFields.filter((field) => field.group === group)
                          .length
                      }
                    </span>
                    <span className="grow" />
                    {group === "用户与身份" && senderProfileExists ? (
                      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Checkbox
                          id="sender-sync"
                          checked={draft.senderSync}
                          onCheckedChange={() => dispatch(toggleSenderSync())}
                        />
                        <label htmlFor="sender-sync" className="cursor-pointer">
                          同步发送者与资料 ID
                        </label>
                      </span>
                    ) : null}
                  </div>
                  <FieldRows
                    fields={visibleFields.filter(
                      (field) => field.group === group,
                    )}
                    onEdit={onEdit}
                  />
                </section>
              ))
            )}
          </div>
        ) : tab === "raw" ? (
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-[9px]">
                {schema.wire === "xml" ? "平台原始 XML" : "平台原始 JSON"}
              </Badge>
              <span className="grow" />
              {schema.wire === "json" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      setRawText(
                        `${JSON.stringify(JSON.parse(rawText), null, 2)}`,
                      );
                      setRawError("");
                    } catch {
                      setRawError("报文还不是合法 JSON，无法格式化。");
                    }
                  }}
                >
                  格式化
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={applyRaw}>
                应用到字段
              </Button>
            </div>
            <Textarea
              aria-label={
                schema.wire === "xml" ? "完整 XML 报文" : "完整 JSON 报文"
              }
              className="min-h-0 flex-1 resize-none font-mono text-[11px] leading-relaxed"
              spellCheck={false}
              value={rawText}
              onChange={(change) => {
                setRawText(change.target.value);
                setRawError("");
                setApplied(false);
              }}
            />
            {rawError ? (
              <p role="alert" className="text-[10px] text-destructive">
                {rawError}
              </p>
            ) : applied ? (
              <p role="status" className="text-[10px] text-success">
                完整报文已应用到字段。
              </p>
            ) : (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {schema.wire === "xml"
                  ? "字段编辑与完整报文共享同一份参数。手工增补的未知元素按原文片段保留，表单中以「待补充说明」标注。"
                  : "字段编辑与完整报文共享同一份参数。手工新增的未知字段会原样保留，表单中以「待补充说明」标注。"}
              </p>
            )}
          </div>
        ) : tab === "expect" ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
            <p className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              发送时，回执将与这里的期望对照；正文留空表示只检查 HTTP
              状态。期望随草稿保存进版本，直发未保存的草稿也按当前值比对。
            </p>
            <div className="grid grid-cols-[minmax(140px,200px)_minmax(0,1fr)] items-start gap-5">
              <div className="space-y-2">
                <Label htmlFor="expected-status">期望 HTTP 状态</Label>
                <Input
                  id="expected-status"
                  type="number"
                  min={100}
                  max={599}
                  className="h-8 font-mono text-xs"
                  value={draft.expected.status}
                  onChange={(change) =>
                    dispatch(
                      setDraftExpected({
                        status: Number(change.target.value) || 200,
                      }),
                    )
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  如 200、204、403。
                </p>
              </div>
              <div className="space-y-2">
                <Label>正文比对方式</Label>
                <fieldset className="flex gap-1">
                  <legend className="sr-only">正文比对方式</legend>
                  {RECEIPT_BODY_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        dispatch(setDraftExpected({ bodyMode: mode.id }))
                      }
                      aria-pressed={draft.expected.bodyMode === mode.id}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-colors",
                        draft.expected.bodyMode === mode.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </fieldset>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {
                    RECEIPT_BODY_MODES.find(
                      (mode) => mode.id === draft.expected.bodyMode,
                    )?.hint
                  }
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected-body">期望响应正文</Label>
              <Textarea
                id="expected-body"
                rows={5}
                className="font-mono text-xs"
                spellCheck={false}
                placeholder="留空时不校验正文"
                value={draft.expected.body}
                onChange={(change) =>
                  dispatch(setDraftExpected({ body: change.target.value }))
                }
              />
              <p className="font-mono text-[10px] text-muted-foreground">
                {describeExpected(draft.expected)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              保存即追加不可变版本：再次保存生成新版本，旧版本内容不变、可随时回看。
            </p>
            {versionsDesc.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                还没有保存过版本。
              </p>
            ) : (
              versionsDesc.map((version) => (
                <div
                  key={version.revision}
                  className="rounded-lg border border-border"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Badge variant="outline" className="font-mono text-[9px]">
                      v{version.revision}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(version.savedAt)}
                    </span>
                    <span className="grow" />
                    <span className="font-mono text-[9px] text-muted-foreground">
                      期望 {version.expected.status}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={viewing?.revision === version.revision}
                      onClick={() =>
                        setViewRevision(
                          viewing?.revision === version.revision
                            ? null
                            : version.revision,
                        )
                      }
                    >
                      <Eye className="size-3.5" aria-hidden />
                      {viewing?.revision === version.revision ? "收起" : "回看"}
                    </Button>
                  </div>
                  {viewing?.revision === version.revision ? (
                    <div className="border-t border-border p-3">
                      <VersionJson version={version} schema={schema} />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <DispatchPanel />
    </div>
  );
}
