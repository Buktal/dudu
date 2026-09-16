import { WorkspacePanelToggle } from "@/components/workspace-action";

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
  return (
    <WorkspacePanelToggle
      side="right"
      open={open}
      label="来访资料"
      onToggle={onToggle}
      disabled={disabled}
      className={className}
    />
  );
}
