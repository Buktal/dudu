import { Columns2, MessageCircle, Zap } from "lucide-react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { type ReactNode, useId, useRef } from "react";
import { Brand } from "@/components/brand";
import { DesktopWindowControls } from "@/components/desktop-window-controls";
import { ThemePicker } from "@/components/theme-picker";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isDesktopWindow } from "@/lib/desktop-window";
import {
  isReceptionMode,
  type ReceptionMode,
  receptionModeKeys,
  receptionModes,
} from "@/lib/reception-mode";
import { cn } from "@/lib/utils";

const modeIcons = { calm: MessageCircle, parallel: Columns2, quick: Zap };

export type WorkspaceShellProps = {
  mode: ReceptionMode;
  onModeChange: (mode: ReceptionMode) => void;
  children: ReactNode;
  toolbarActions?: ReactNode;
  navigation?: ReactNode;
};

export function WorkspaceShell({
  mode,
  onModeChange,
  children,
  toolbarActions,
  navigation,
}: WorkspaceShellProps) {
  const { theme, setTheme } = useTheme();
  const modeLabelId = useId();
  const contentRef = useRef<HTMLElement>(null);

  return (
    <MotionConfig reducedMotion="user">
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
              <span
                id={modeLabelId}
                className="text-[11px] whitespace-nowrap text-muted-foreground max-[1180px]:sr-only"
              >
                接待方式
              </span>
              <LayoutGroup id={modeLabelId}>
                <div className="rounded-xl border border-border bg-card p-1 max-[760px]:w-full">
                  <ToggleGroup
                    value={[mode]}
                    aria-labelledby={modeLabelId}
                    spacing={1}
                    className="gap-1 max-[760px]:grid max-[760px]:w-full max-[760px]:grid-cols-3"
                    onValueChange={(values) => {
                      if (isReceptionMode(values[0])) onModeChange(values[0]);
                    }}
                  >
                    {receptionModeKeys.map((key) => {
                      const Icon = modeIcons[key];
                      return (
                        <ToggleGroupItem
                          key={key}
                          value={key}
                          aria-label={`${receptionModes[key].name}模式`}
                          title={receptionModes[key].description}
                          className="relative min-w-[91px] rounded-lg max-[760px]:min-w-0"
                        >
                          {mode === key && (
                            <motion.span
                              aria-hidden="true"
                              layoutId="reception-mode-selection"
                              className="pointer-events-none absolute inset-0 rounded-lg border border-ring/15 bg-accent"
                              transition={{
                                type: "spring",
                                stiffness: 360,
                                damping: 30,
                              }}
                            />
                          )}
                          <span
                            className={cn(
                              "relative flex items-center gap-2",
                              mode === key
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            <Icon data-icon="inline-start" />
                            <span>{receptionModes[key].name}</span>
                          </span>
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>
              </LayoutGroup>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5 max-[760px]:col-start-2 max-[760px]:row-start-1">
              <ThemePicker value={theme} onChange={setTheme} />
              {toolbarActions}
              <DesktopWindowControls className="ml-1 -mr-[22px] max-[760px]:-mr-3" />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 pr-3 max-[760px]:pr-1">
            {mode === "calm" && (
              <nav
                aria-label="工作台导航"
                className="flex w-16 shrink-0 flex-col items-center gap-4 border-r border-border/50 bg-card py-6 text-muted-foreground max-[760px]:hidden"
              >
                {navigation ?? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<Button variant="default" size="icon-lg" />}
                      className="rounded-lg"
                      aria-label="所有会话"
                      aria-current="page"
                      onClick={() => contentRef.current?.focus()}
                    >
                      <MessageCircle data-icon="inline-start" />
                    </TooltipTrigger>
                    <TooltipContent side="right">所有会话</TooltipContent>
                  </Tooltip>
                )}
              </nav>
            )}
            <motion.main
              ref={contentRef}
              aria-label="接待工作区"
              tabIndex={-1}
              className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.main>
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
