import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { DesktopWindowControls } from "@/components/desktop-window-controls";
import { ReceptionModeSwitch } from "@/components/reception-mode-switch";
import { ThemePicker } from "@/components/theme-picker";
import { useTheme } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceMotion } from "@/components/workspace-motion";
import { isDesktopWindow } from "@/lib/desktop-window";
import type { ReceptionMode } from "@/lib/reception-mode";

export type WorkspaceShellProps = {
  mode: ReceptionMode;
  onModeChange: (mode: ReceptionMode) => void;
  children: ReactNode;
  toolbarActions?: ReactNode;
};

export function WorkspaceShell({
  mode,
  onModeChange,
  children,
  toolbarActions,
}: WorkspaceShellProps) {
  const { theme, setTheme } = useTheme();

  return (
    <WorkspaceMotion>
      <TooltipProvider>
        <div className="isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
          <header
            data-tauri-drag-region={isDesktopWindow() ? "deep" : undefined}
            className="grid min-h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5 px-[22px] max-[1180px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[1180px]:gap-3 max-[760px]:min-h-[104px] max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-x-3 max-[760px]:gap-y-1.5 max-[760px]:px-3 max-[760px]:pt-2 max-[760px]:pb-2.5"
          >
            <div className="flex min-w-0 items-center gap-4 max-[760px]:gap-2">
              <Brand />
            </div>
            <div className="flex items-center justify-center gap-3 max-[760px]:col-span-2 max-[760px]:row-start-2">
              <span className="text-[11px] whitespace-nowrap text-muted-foreground max-[1180px]:sr-only">
                接待方式
              </span>
              <ReceptionModeSwitch
                value={mode}
                onChange={onModeChange}
                className="max-[760px]:w-full"
              />
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5 max-[760px]:col-start-2 max-[760px]:row-start-1">
              <ThemePicker value={theme} onChange={setTheme} />
              {toolbarActions}
              <DesktopWindowControls className="ml-1 -mr-[22px] max-[760px]:-mr-3" />
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <main
              aria-label="接待工作区"
              tabIndex={-1}
              className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
            >
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </WorkspaceMotion>
  );
}
