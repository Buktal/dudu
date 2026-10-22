import { Copy, type LucideIcon, Minus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InlineActionError } from "@/components/inline-action-error";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  closeDesktopWindow,
  isDesktopWindow,
  minimizeDesktopWindow,
  toggleDesktopWindowMaximize,
  watchDesktopWindowMaximized,
} from "@/lib/desktop-window";
import { cn } from "@/lib/utils";

function WindowButton({
  label,
  icon: Icon,
  close = false,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  close?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        className={cn(
          "h-9 w-11 rounded-none",
          close &&
            "[--muted:var(--destructive)] [--foreground:var(--primary-foreground)]",
        )}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon data-icon="inline-start" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function DesktopWindowControls({ className }: { className?: string }) {
  const desktop = isDesktopWindow();
  const [maximized, setMaximized] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!desktop) return;
    return watchDesktopWindowMaximized(setMaximized, () => {
      setError("暂时无法读取窗口状态，请重试窗口操作。");
    });
  }, [desktop]);

  if (!desktop) return null;
  const maximizeLabel =
    maximized === null ? "最大化／还原" : maximized ? "向下还原" : "最大化";

  const run = async (action: () => Promise<void>, label: string) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(`未能${label}窗口，请重试。`);
    } finally {
      running.current = false;
      setPending(false);
    }
  };

  return (
    <div
      className={cn("flex shrink-0 flex-col items-end", className)}
      data-tauri-drag-region="false"
    >
      <div className="flex shrink-0 text-muted-foreground">
        <WindowButton
          label="最小化"
          icon={Minus}
          disabled={pending}
          onClick={() => void run(minimizeDesktopWindow, "最小化")}
        />
        <WindowButton
          label={maximizeLabel}
          icon={maximized ? Copy : Square}
          disabled={pending}
          onClick={() => void run(toggleDesktopWindowMaximize, "切换")}
        />
        <WindowButton
          label="关闭"
          icon={X}
          close
          disabled={pending}
          onClick={() => void run(closeDesktopWindow, "关闭")}
        />
      </div>
      <InlineActionError message={error} className="mt-1 max-w-64" />
    </div>
  );
}
