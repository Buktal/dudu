import { Check, Download, Loader2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AppDispatch } from "@/store";
import type { StoredSchemaDefinition } from "../api";
import {
  buildDefinitionsExport,
  DEFINITIONS_EXPORT_NAME,
  parseDefinitionsImport,
} from "../definitions/io";
import { finalizeField, resolveEditorFields } from "../definitions/resolve";
import type { EventSchema, FieldDescriptor, WirePayload } from "../schemas";
import { applyFieldDefinitions } from "../stores/events-slice";

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

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
    setApplying(true);
    try {
      await dispatch(
        applyFieldDefinitions({
          schemaId: schema.id,
          version,
          fields: fields.map(finalizeField),
        }),
      ).unwrap();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="关闭字段说明"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="字段说明"
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
      >
        <header className="flex flex-none items-start gap-3 border-b border-border px-5 pt-4 pb-3">
          <div className="space-y-0.5">
            <h2 className="font-heading text-base font-semibold text-foreground">
              字段说明
            </h2>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              修改名称、含义和分组，同一类事件都会更新。参数值不会因此改变。
            </p>
          </div>
          <span className="grow" />
          <Button variant="ghost" size="sm" aria-label="关闭" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="字段列表"
            className="w-56 flex-none overflow-y-auto border-r border-border bg-muted/40 p-2"
          >
            {fields.map((field) => (
              <button
                key={field.path}
                type="button"
                onClick={() => setSelectedPath(field.path)}
                aria-current={
                  selected?.path === field.path ? "true" : undefined
                }
                className={cn(
                  "mb-0.5 flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  selected?.path === field.path
                    ? "bg-secondary text-secondary-foreground"
                    : "hover:bg-accent",
                )}
              >
                <span className="truncate text-[11px] font-medium">
                  {field.title}
                </span>
                <span className="truncate font-mono text-[9px] text-muted-foreground">
                  {field.path}
                </span>
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-[9px] uppercase"
                  >
                    {selected.type}
                  </Badge>
                  {selected.required ? (
                    <Badge variant="outline" className="text-[9px]">
                      必填
                    </Badge>
                  ) : null}
                  <code
                    className="truncate font-mono text-[10px] text-muted-foreground"
                    title={selected.path}
                  >
                    {selected.path}
                  </code>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dict-title">显示名称</Label>
                  <Input
                    id="dict-title"
                    className="h-8 text-xs"
                    value={selected.title}
                    onChange={(change) =>
                      update({ title: change.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dict-description">字段含义</Label>
                  <Textarea
                    id="dict-description"
                    rows={4}
                    className="text-xs"
                    value={selected.description}
                    onChange={(change) =>
                      update({ description: change.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dict-group">所属分组</Label>
                  <Input
                    id="dict-group"
                    className="h-8 text-xs"
                    value={selected.group}
                    onChange={(change) =>
                      update({ group: change.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="dict-required"
                    checked={selected.required === true}
                    onCheckedChange={(checked) =>
                      update({ required: checked === true })
                    }
                  />
                  <Label
                    htmlFor="dict-required"
                    className="cursor-pointer text-xs"
                  >
                    必填字段
                  </Label>
                </div>
                <p className="border-t border-border pt-3 font-mono text-[9px] leading-relaxed text-muted-foreground">
                  说明范围：{schema.name} · {schema.version}
                  <br />
                  资料来源：
                  <a
                    href={schema.source}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    平台字段文档 ↗
                  </a>
                </p>
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                没有可编辑的字段。
              </p>
            )}
          </div>
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-border px-5 py-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(change) => {
              const file = change.target.files?.[0];
              change.target.value = "";
              if (file) void onImportFile(file);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden />
            导入字段定义
          </Button>
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="size-3.5" aria-hidden />
            导出字段定义
          </Button>
          <span className="grow" />
          {error ? (
            <p role="alert" className="mr-2 text-[10px] text-destructive">
              {error}
            </p>
          ) : null}
          <Button size="sm" disabled={applying} onClick={() => void onApply()}>
            {applying ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            应用说明
          </Button>
        </footer>
      </div>
    </div>
  );
}
