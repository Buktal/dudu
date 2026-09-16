import {
  MotionConfig,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

export function useWorkspaceTransition(duration = 0.18) {
  const { reduceMotion } = useTheme();
  const systemReduced = useReducedMotion();
  return {
    duration: reduceMotion || systemReduced ? 0 : duration,
    ease: [0.22, 1, 0.36, 1] as const,
  };
}

export function WorkspaceMotion({ children }: { children: ReactNode }) {
  const { reduceMotion } = useTheme();
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}

export function WorkspaceView({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const present = useIsPresent();
  const transition = useWorkspaceTransition();
  return (
    <motion.div
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
      initial={{ opacity: 0, y: transition.duration ? 4 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: transition.duration ? -3 : 0 }}
      transition={transition}
      inert={!present}
    >
      {children}
    </motion.div>
  );
}

export function WorkspacePanel({
  open,
  side,
  children,
  className,
}: {
  open: boolean;
  side: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  const transition = useWorkspaceTransition(0.22);
  return (
    <motion.div
      className={cn("min-h-0 shrink-0 overflow-hidden", className)}
      initial={false}
      style={{
        width:
          "calc(var(--workspace-panel-width) * var(--workspace-panel-progress))",
        [side === "right" ? "marginLeft" : "marginRight"]:
          "calc(var(--workspace-gap, 0px) * (var(--workspace-panel-progress) - 1))",
      }}
      animate={{
        "--workspace-panel-progress": open ? 1 : 0,
        opacity: open ? 1 : 0,
      }}
      transition={transition}
      inert={!open}
      aria-hidden={!open}
    >
      <div className="h-full min-h-0 w-(--workspace-panel-width)">
        {children}
      </div>
    </motion.div>
  );
}
