import { Columns2, LayoutGrid, MessageCircle } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  isReceptionMode,
  type ReceptionMode,
  receptionModeKeys,
  receptionModes,
} from "@/lib/reception-mode";
import { cn } from "@/lib/utils";
import { useWorkspaceTransition } from "./workspace-motion";

const modeIcons = {
  calm: MessageCircle,
  parallel: Columns2,
  quick: LayoutGrid,
};

export function ReceptionModeSwitch({
  value,
  onChange,
  className,
}: {
  value: ReceptionMode;
  onChange: (mode: ReceptionMode) => void;
  className?: string;
}) {
  const id = useId();
  const transition = useWorkspaceTransition();
  return (
    <LayoutGroup id={id}>
      <div
        className={cn("rounded-xl border border-border bg-card p-1", className)}
      >
        <ToggleGroup
          value={[value]}
          aria-label="接待方式"
          spacing={1}
          className="grid w-full grid-cols-3"
          onValueChange={(values) => {
            if (isReceptionMode(values[0])) onChange(values[0]);
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
                {value === key && (
                  <motion.span
                    aria-hidden="true"
                    layoutId="mode-selection"
                    className="pointer-events-none absolute inset-0 rounded-lg bg-selection"
                    transition={transition}
                  />
                )}
                <span
                  className={cn(
                    "relative flex items-center gap-2",
                    value === key
                      ? "text-selection-foreground"
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
  );
}
