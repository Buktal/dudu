import { CircleHelp } from "lucide-react";
import { Fragment, useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { receptionModeKeys, receptionModes } from "@/lib/reception-mode";

const shortcuts = [
  { keys: ["Ctrl", "K"], label: "搜索访客或消息" },
  { keys: ["Enter"], label: "发送回复" },
  { keys: ["Shift", "Enter"], label: "输入框换行" },
  { keys: ["Ctrl", "Enter"], label: "发送并接待下一位" },
  { keys: ["Alt", "1 / 2"], label: "切换并排窗口" },
  { keys: ["Esc"], label: "关闭当前弹窗" },
];

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
      <DialogContent className="max-h-[85dvh] gap-5 overflow-y-auto rounded-2xl p-5 sm:max-w-[520px]">
        <DialogHeader className="pr-8">
          <DialogTitle>工作台帮助</DialogTitle>
          <DialogDescription className="sr-only">
            接待方式与常用快捷键
          </DialogDescription>
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
          <dl className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-sm">
            {receptionModeKeys.map((mode) => (
              <div key={mode} className="contents">
                <dt className="font-medium whitespace-nowrap">
                  {receptionModes[mode].name}
                </dt>
                <dd className="min-w-0 leading-relaxed text-muted-foreground">
                  {receptionModes[mode].description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby={`${id}-keys`}>
          <h3
            id={`${id}-keys`}
            className="mb-1 text-xs font-medium text-muted-foreground"
          >
            快捷操作
          </h3>
          <dl className="flex flex-col gap-1">
            {shortcuts.map(({ keys, label }) => (
              <div
                key={label}
                className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 py-1.5"
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
        <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <p>输入法选字时，Enter 只确认文字。</p>
          <p>Mac 使用 ⌘ 替代 Ctrl；接待下一位不会结束当前会话。</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
