import {
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WorkspaceActionProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean;
  showLabel?: boolean;
  className?: string;
  iconClassName?: string;
};

export function WorkspaceAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  expanded,
  pressed,
  showLabel = false,
  className,
  iconClassName,
}: WorkspaceActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={showLabel ? "sm" : "icon-sm"}
            className={className}
            disabled={disabled}
            aria-label={label}
            aria-expanded={expanded}
            aria-pressed={pressed}
            onClick={onClick}
          />
        }
      >
        <Icon data-icon="inline-start" className={iconClassName} />
        {showLabel && label}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const panelIcons = {
  left: { open: PanelLeftClose, closed: PanelLeftOpen },
  right: { open: PanelRightClose, closed: PanelRightOpen },
};

export function WorkspacePanelToggle({
  side,
  open,
  label,
  onToggle,
  ...props
}: Omit<WorkspaceActionProps, "icon" | "expanded" | "onClick"> & {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <WorkspaceAction
      {...props}
      icon={panelIcons[side][open ? "open" : "closed"]}
      label={`${open ? "收起" : "展开"}${label}`}
      expanded={open}
      onClick={onToggle}
    />
  );
}
