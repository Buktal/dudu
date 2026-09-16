import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function VisitorInfoToggle({
  open,
  onToggle,
  disabled = false,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const label = open ? "收起来访资料" : "展开来访资料";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            disabled={disabled}
            aria-label={label}
            aria-expanded={open}
            onClick={onToggle}
          />
        }
      >
        {open ? (
          <PanelRightClose data-icon="inline-start" />
        ) : (
          <PanelRightOpen data-icon="inline-start" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
