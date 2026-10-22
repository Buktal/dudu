import { CircleHelp, Info, Keyboard } from "lucide-react";
import { Fragment, useId } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { receptionModeKeys, receptionModes } from "@/lib/reception-mode";
import { INBOX_SHORTCUTS } from "../hooks/use-inbox-shortcuts";
import { ReceptionModePreview } from "./reception-mode-preview";

export function WorkspaceHelp() {
  const id = useId();
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="使用帮助"
            title="使用帮助与快捷键"
          />
        }
      >
        <CircleHelp data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto rounded-2xl p-5 sm:max-w-[560px]">
        <DialogHeader className="flex-row items-center gap-3 pr-8 text-left">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-primary"
          >
            <CircleHelp className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <DialogTitle>工作台帮助</DialogTitle>
            <DialogDescription>接待方式与常用快捷键</DialogDescription>
          </div>
        </DialogHeader>
        <section
          className="flex flex-col gap-3"
          aria-labelledby={`${id}-modes`}
        >
          <h3
            id={`${id}-modes`}
            className="text-xs font-medium text-muted-foreground"
          >
            接待方式
          </h3>
          <dl className="grid grid-cols-3 items-start gap-4 max-[420px]:grid-cols-1">
            {receptionModeKeys.map((mode) => (
              <div
                key={mode}
                className="flex min-w-0 flex-col gap-2.5 max-[420px]:grid max-[420px]:grid-cols-[96px_minmax(0,1fr)] max-[420px]:gap-x-3 max-[420px]:gap-y-1"
              >
                <dt className="flex flex-col gap-2.5 max-[420px]:contents">
                  <div className="max-[420px]:row-span-2">
                    <ReceptionModePreview mode={mode} />
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {receptionModes[mode].name}
                  </span>
                </dt>
                <dd className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                  {receptionModes[mode].description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <Separator />
        <section className="flex flex-col gap-2" aria-labelledby={`${id}-keys`}>
          <h3
            id={`${id}-keys`}
            className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
          >
            <Keyboard className="size-3.5" aria-hidden="true" />
            快捷操作
          </h3>
          <dl className="flex flex-col gap-1">
            {INBOX_SHORTCUTS.map(({ keys, label }) => (
              <div
                key={label}
                className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 py-1"
              >
                <dt className="min-w-0 text-sm leading-relaxed">{label}</dt>
                <dd className="flex items-center justify-end gap-1">
                  {keys.map((key, index) => (
                    <Fragment key={key}>
                      {index > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          +
                        </span>
                      )}
                      <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] whitespace-nowrap">
                        {key}
                      </kbd>
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <Alert className="rounded-xl px-3 py-2.5">
          <Info />
          <AlertDescription className="gap-1 text-xs leading-relaxed">
            <p>输入法选字时，Enter 只确认文字。</p>
            <p>Mac 使用 ⌘ 替代 Ctrl；接待下一位不会结束当前会话。</p>
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
}
