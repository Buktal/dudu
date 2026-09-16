import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { DesktopWindowControls } from "@/components/desktop-window-controls";
import { ThemePicker } from "@/components/theme-picker";
import { useTheme } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceMotion, WorkspaceView } from "@/components/workspace-motion";
import { isDesktopWindow } from "@/lib/desktop-window";

export function AccountScreen({ children }: { children?: ReactNode }) {
  const { theme, setTheme } = useTheme();
  return (
    <WorkspaceMotion>
      <TooltipProvider>
        <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
          <header
            data-tauri-drag-region={isDesktopWindow() ? "deep" : undefined}
            className="flex h-16 shrink-0 items-center justify-between gap-4 px-5"
          >
            <Brand />
            <div className="flex items-center gap-2">
              <ThemePicker value={theme} onChange={setTheme} />
              <DesktopWindowControls className="-mr-5" />
            </div>
          </header>
          <main className="flex min-h-0 flex-1 overflow-y-auto p-5">
            <WorkspaceView className="my-auto items-center justify-center">
              {children ?? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                  正在打开工作台…
                </p>
              )}
            </WorkspaceView>
          </main>
        </div>
      </TooltipProvider>
    </WorkspaceMotion>
  );
}
