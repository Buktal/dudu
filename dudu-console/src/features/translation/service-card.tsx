import { Bot, Languages, Play, Trash2 } from "lucide-react";
import { TextField } from "@/components/form-field";
import { SubmitMessage } from "@/components/submit-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import type { Provider, Service } from "./api";

export function ServiceCard({
  service,
  provider,
  active,
  busy,
  testing,
  error,
  result,
  onChange,
  onTest,
  onRemove,
}: {
  service: Service;
  provider?: Provider;
  active: boolean;
  busy: boolean;
  testing: boolean;
  error: string | null;
  result: string | null;
  onChange: (patch: Partial<Service>) => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  const model = provider?.kind === "model";
  const Icon = model ? Bot : Languages;
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <span className="metric-icon" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>
              <h3 className="truncate">{service.name || provider?.name}</h3>
            </CardTitle>
            <CardDescription>
              {provider?.name} · {model ? "模型翻译" : "常规翻译"}
            </CardDescription>
          </div>
        </div>
        {active && (
          <CardAction>
            <Badge>企业默认</Badge>
          </CardAction>
        )}
      </CardHeader>
      <Separator />
      <CardContent>
        <FieldGroup className="gap-4">
          <TextField
            label="服务名称"
            required
            maxLength={80}
            disabled={busy}
            value={service.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <TextField
            label="接口地址"
            required
            type="url"
            maxLength={2048}
            disabled={busy}
            value={service.endpoint}
            onChange={(event) => onChange({ endpoint: event.target.value })}
            description="填写服务提供的完整请求地址，包含接口路径。"
          />
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {provider?.fields.map((field) => {
              const stored =
                field.secret &&
                service.values[field.key] === "__DUDU_SECRET_PRESENT__";
              return (
                <TextField
                  key={field.key}
                  label={field.label}
                  type={field.secret ? "password" : "text"}
                  required={field.required && !stored}
                  maxLength={8192}
                  autoComplete="off"
                  disabled={busy}
                  value={stored ? "" : (service.values[field.key] ?? "")}
                  placeholder={
                    stored ? "已保存 · 输入新密钥替换" : `输入${field.label}`
                  }
                  onChange={(event) =>
                    onChange({
                      values: {
                        ...service.values,
                        [field.key]: event.target.value,
                      },
                    })
                  }
                />
              );
            })}
          </FieldGroup>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 border-t">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onTest}
          >
            <Play data-icon="inline-start" />
            {testing ? "正在测试…" : "测试连接"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onRemove}
            aria-label={`移除${service.name || provider?.name}配置`}
          >
            <Trash2 data-icon="inline-start" />
            移除
          </Button>
        </div>
        <SubmitMessage
          error={error}
          notice={result ? `连接成功 · ${result}` : null}
        />
      </CardFooter>
    </Card>
  );
}
