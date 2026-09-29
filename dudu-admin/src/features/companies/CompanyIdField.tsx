import { CheckCircle2, Shuffle } from "lucide-react";
import { useEffect, useRef } from "react";
import { adminApi } from "@/api/admin-api";
import { errorMessage, isCancelled } from "@/api/client";
import { useAdmin } from "@/api/context";
import { validCompanyId } from "@/api/validators";
import { TextField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export interface IdSelection {
  value: string;
  status:
    | "idle"
    | "checking"
    | "generating"
    | "available"
    | "occupied"
    | "error";
  error?: string;
}

export function CompanyIdField({
  selection,
  onChange,
  disabled,
}: {
  selection: IdSelection;
  onChange: (selection: IdSelection) => void;
  disabled: boolean;
}) {
  const client = useAdmin();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const select = async (generate: boolean) => {
    request.current?.abort();
    if (!generate && !validCompanyId(selection.value)) {
      onChange({
        ...selection,
        status: "error",
        error: "请输入 100000–999999 的六位数字",
      });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    onChange({ ...selection, status: generate ? "generating" : "checking" });
    try {
      const result = generate
        ? await adminApi.candidate(client, controller.signal)
        : await adminApi.availability(
            client,
            selection.value,
            controller.signal,
          );
      if (controller.signal.aborted || request.current !== controller) return;
      onChange({
        value: result.companyId,
        status:
          "available" in result && !result.available ? "occupied" : "available",
      });
    } catch (error) {
      if (
        !controller.signal.aborted &&
        request.current === controller &&
        !isCancelled(error)
      )
        onChange({ ...selection, status: "error", error: errorMessage(error) });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="企业 ID"
        value={selection.value}
        inputMode="numeric"
        maxLength={6}
        required
        disabled={disabled}
        error={
          selection.status === "error"
            ? selection.error
            : selection.status === "occupied"
              ? "企业 ID 已被占用，请重新选择"
              : undefined
        }
        placeholder="六位数字"
        onChange={(event) => {
          request.current?.abort();
          onChange({ value: event.target.value, status: "idle" });
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => void select(true)}
        >
          <Shuffle data-icon="inline-start" />
          {selection.status === "generating" ? "生成中…" : "随机生成"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => void select(false)}
        >
          {selection.status === "checking" ? "检测中…" : "检测"}
        </Button>
        {selection.status === "available" && (
          <span
            role="status"
            className="flex items-center gap-1 text-sm text-success"
          >
            <CheckCircle2 className="size-4" />
            当前可用
          </span>
        )}
      </div>
    </div>
  );
}
