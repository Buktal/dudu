import { CheckIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Notice } from "@/components/notice";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import type { AppDispatch } from "@/store";
import type { StoredSchemaDefinition } from "../api";
import {
  buildDefinitionsExport,
  DEFINITIONS_EXPORT_NAME,
  parseDefinitionsImport,
} from "../definitions/io";
import { finalizeField, resolveEditorFields } from "../definitions/resolve";
import type { EventSchema, FieldDescriptor, WirePayload } from "../schemas";
import { applyFieldDefinitions } from "../stores/definitions-slice";

/** 单文件导入上限（照原型的防呆尺寸） */
const IMPORT_SIZE_LIMIT = 5 * 1024 * 1024;

type DictionaryDialogProps = {
  schema: EventSchema;
  /** 表单形态载荷（contentString 已解析）：未知字段由此展开进列表 */
  payload: WirePayload;
  /** 已落库的用户定义（再次打开时回显） */
  userDefinition: StoredSchemaDefinition | undefined;
  /** 打开时选中的字段（如未知字段的「补充说明」入口） */
  initialPath?: string | null;
  onClose: () => void;
};

/**
 * 字典弹窗（照原型 dictionary，#22）：查看/编辑当前事件模板的全部字段说明
 * （已知 + 未知）。左栏字段列表、右栏编辑区；导入两段式——校验合法只载入
 * 编辑态，点「应用说明」才写成用户定义并持久化，未知字段由此转正。
 * path 与 type 不可改（type 由值/定义推导），来源展示为 schema 级官方文档。
 */
export function DictionaryDialog({
  schema,
  payload,
  userDefinition,
  initialPath,
  onClose,
}: DictionaryDialogProps) {
  const dispatch = useDispatch<AppDispatch>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 弹窗内编辑态：生效字段（基线 + 用户定义 + 未知回退）去掉值/标注后的可编辑说明
  const [fields, setFields] = useState<FieldDescriptor[]>(() =>
    resolveEditorFields(schema, userDefinition?.fields, payload).map(
      ({ value: _value, unknown: _unknown, ...meta }) => meta,
    ),
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialPath ?? null,
  );
  // 应用说明落库时携带的版本：随当前 schema，导入后随文件
  const [version, setVersion] = useState(
    () => userDefinition?.version || schema.version,
  );
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [query, setQuery] = useState("");
  const visibleFields = fields.filter((field) =>
    `${field.title} ${field.path}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const selected = useMemo(() => {
    const found = fields.find((field) => field.path === selectedPath);
    return found ?? fields[0] ?? null;
  }, [fields, selectedPath]);

  const update = (patch: Partial<FieldDescriptor>) => {
    if (!selected) return;
    setFields((current) =>
      current.map((field) =>
        field.path === selected.path ? { ...field, ...patch } : field,
      ),
    );
    setError("");
  };

  const onExport = () => {
    const exported = buildDefinitionsExport(
      schema.id,
      version,
      fields.map(finalizeField),
    );
    const blob = new Blob([JSON.stringify(exported, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = DEFINITIONS_EXPORT_NAME(schema.id);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImportFile = async (file: File) => {
    try {
      if (file.size > IMPORT_SIZE_LIMIT) {
        throw new Error("文件请控制在 5 MB 以内。");
      }
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        throw new Error("字段定义不是合法的 JSON。");
      }
      const parsed = parseDefinitionsImport(raw, schema.id);
      setFields(parsed.fields);
      setVersion(parsed.version);
      setSelectedPath(parsed.fields[0]?.path ?? null);
      setError("");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "字段定义导入失败。",
      );
    }
  };

  const onApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await dispatch(
        applyFieldDefinitions({
          schemaId: schema.id,
          version,
          fields: fields.map(finalizeField),
        }),
      ).unwrap();
      toast.add({ title: "字段说明已更新", type: "success" });
      onClose();
    } catch (applyError) {
      // thunk unwrap 对非 Error 抛出值（Tauri invoke 错误是字符串）给出 {message} 形状
      setError(
        applyError instanceof Error
          ? applyError.message
          : applyError != null &&
              typeof applyError === "object" &&
              "message" in applyError
            ? String(applyError.message)
            : "应用说明失败。",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <WorkspaceDialog
      open
      wide
      title="字段说明"
      description="修改名称、含义和分组，同一类事件都会更新。参数值不会因此改变。"
      onClose={() => {
        if (!applying) onClose();
      }}
      footer={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImportFile(file);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={applying}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon aria-hidden="true" data-icon="inline-start" />
            导入字段定义
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={applying}
            onClick={onExport}
          >
            <DownloadIcon aria-hidden="true" data-icon="inline-start" />
            导出字段定义
          </Button>
          <span className="min-w-0 flex-1" />
          <Button
            variant="default"
            disabled={applying}
            onClick={() => void onApply()}
          >
            {applying ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <CheckIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {applying ? "正在应用…" : "应用说明"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3 sm:border-r sm:pr-3">
          <SearchInput
            aria-label="搜索字段说明"
            placeholder="搜索字段"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={query ? () => setQuery("") : undefined}
          />
          <nav
            className="flex max-h-40 flex-col gap-1 overflow-auto sm:max-h-[45dvh]"
            aria-label="字段列表"
          >
            {visibleFields.map((field) => (
              <Button
                key={field.path}
                type="button"
                variant={selected?.path === field.path ? "secondary" : "ghost"}
                className="h-auto w-full shrink-0 flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal"
                aria-current={
                  selected?.path === field.path ? "true" : undefined
                }
                onClick={() => setSelectedPath(field.path)}
              >
                {field.title}
                <span className="max-w-full truncate font-mono text-xs text-muted-foreground">
                  {field.path}
                </span>
              </Button>
            ))}
            {!visibleFields.length ? (
              <p className="p-3 text-sm text-muted-foreground">
                没有匹配的字段
              </p>
            ) : null}
          </nav>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <FieldGroup>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{selected.type}</Badge>
                <code className="text-xs text-muted-foreground wrap-anywhere">
                  {selected.path}
                </code>
              </div>
              <Field>
                <FieldLabel htmlFor="dict-title">显示名称</FieldLabel>
                <Input
                  id="dict-title"
                  value={selected.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-description">字段含义</FieldLabel>
                <Textarea
                  id="dict-description"
                  value={selected.description}
                  onChange={(event) =>
                    update({ description: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-group">所属分组</FieldLabel>
                <Input
                  id="dict-group"
                  value={selected.group}
                  onChange={(event) => update({ group: event.target.value })}
                />
              </Field>
            </FieldGroup>
          ) : (
            <p>没有可编辑的字段。</p>
          )}
          <div className="text-xs leading-relaxed text-muted-foreground wrap-anywhere">
            说明范围：{schema.name} · {schema.version}
            <br />
            资料来源：
            <a href={schema.source} target="_blank" rel="noreferrer">
              平台字段文档 ↗
            </a>
          </div>
        </div>
      </div>
      {error ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error}
        </Notice>
      ) : null}
    </WorkspaceDialog>
  );
}
