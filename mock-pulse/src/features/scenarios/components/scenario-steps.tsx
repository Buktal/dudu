import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  MessageSquareIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { IconButton } from "@/components/icon-button";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { payloadPreview, schemaById } from "@/features/events";
import { isTemplateStep } from "../model";
import type { StepRow } from "../selectors";

type Props = {
  steps: StepRow[];
  busy: boolean;
  onReplace: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSync: (index: number) => void;
  onWait: (index: number, wait: number) => void;
  onEdit?: (eventId: string) => void;
  onRun: (index: number) => void;
};

export function ScenarioSteps({
  steps,
  busy,
  onReplace,
  onMove,
  onRemove,
  onSync,
  onWait,
  onEdit,
  onRun,
}: Props) {
  return (
    <ol className="flex flex-col gap-4" aria-label="剧本步骤">
      {steps.map((row) => {
        const template = isTemplateStep(row.step);
        const schema = template
          ? row.template
          : row.event
            ? schemaById(row.event.schemaId)
            : undefined;
        const EventIcon =
          schema?.kind === "message" ? MessageSquareIcon : FileTextIcon;
        return (
          <li
            className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3"
            key={`${row.index}-${row.event?.id ?? row.template?.id ?? "missing"}`}
          >
            <span className="mt-4 flex size-6 items-center justify-center rounded-full border bg-card font-mono text-xs text-muted-foreground">
              {String(row.index + 1).padStart(2, "0")}
            </span>
            {row.index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-3 top-11 border-l border-dashed"
              />
            ) : null}
            <Card size="sm" className="min-w-0">
              <CardHeader className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="max-w-full justify-start"
                      onClick={() => onReplace(row.index)}
                      title={
                        template
                          ? "从本平台内置模板中替换"
                          : "从本平台事件中替换"
                      }
                    >
                      <EventIcon data-icon="inline-start" />
                      <span className="truncate">
                        {template
                          ? (row.template?.name ?? "内置模板引用缺失")
                          : (row.event?.name ?? "来源事件不存在")}
                      </span>
                      <ChevronDownIcon data-icon="inline-end" />
                    </Button>
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <span>
                      {isTemplateStep(row.step)
                        ? `内置模板 v${row.step.templateVersion}`
                        : `${schema?.name} · 已保存版本 v${row.step.revision}`}
                    </span>
                    {template ? (
                      <Badge variant="secondary">纯引用 · 只读</Badge>
                    ) : null}
                    {!template && row.outdated ? (
                      <Button
                        size="xs"
                        variant="link"
                        onClick={() => onSync(row.index)}
                      >
                        有新版本 v{row.latestRevision} · 同步
                      </Button>
                    ) : null}
                  </CardDescription>
                </div>
                <CardAction className="flex items-center gap-1">
                  <IconButton
                    label="步骤上移"
                    disabled={row.index === 0}
                    onClick={() => onMove(row.index, -1)}
                  >
                    <ArrowUpIcon />
                  </IconButton>
                  <IconButton
                    label="步骤下移"
                    disabled={row.index === steps.length - 1}
                    onClick={() => onMove(row.index, 1)}
                  >
                    <ArrowDownIcon />
                  </IconButton>
                  <IconButton
                    label="移除此步骤"
                    onClick={() => onRemove(row.index)}
                  >
                    <XIcon />
                  </IconButton>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="rounded-lg bg-muted/50 p-3 leading-relaxed wrap-anywhere">
                  {template
                    ? row.template
                      ? payloadPreview(row.template, row.template.payload)
                      : "内置模板引用缺失：模板未注册或钉住的版本已不在注册表。"
                    : row.referenced && schema
                      ? payloadPreview(schema, row.referenced.payload)
                      : "来源版本不可用，请重新选择事件。"}
                </p>
              </CardContent>
              <CardFooter className="flex-wrap gap-3">
                <FieldGroup className="w-52 max-w-full shrink-0">
                  <Field orientation="horizontal" className="items-center">
                    <FieldLabel
                      htmlFor={`step-wait-${row.index}`}
                      className="whitespace-nowrap"
                    >
                      发送前等待
                    </FieldLabel>
                    <Input
                      id={`step-wait-${row.index}`}
                      className="w-20 shrink-0"
                      type="number"
                      min={0}
                      max={60}
                      step={0.1}
                      value={row.step.wait ?? 0}
                      aria-label={`步骤 ${row.index + 1} 发送前等待秒数`}
                      onChange={(event) =>
                        onWait(row.index, Number(event.target.value))
                      }
                    />
                    <span className="text-xs text-muted-foreground">秒</span>
                  </Field>
                </FieldGroup>
                <Badge variant="secondary">
                  期望{" "}
                  {row.referenced?.expected.status ??
                    row.template?.expected.status ??
                    "—"}
                </Badge>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {template ? (
                    <span className="text-xs text-muted-foreground">
                      模板内容只读，不可定制
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="link"
                      disabled={!row.event || !onEdit}
                      onClick={() => {
                        const step = row.step;
                        if (!isTemplateStep(step)) onEdit?.(step.eventId);
                      }}
                    >
                      编辑来源
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || (!row.referenced && !row.template)}
                    onClick={() => onRun(row.index)}
                  >
                    <PlayIcon data-icon="inline-start" />
                    发送此步
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
