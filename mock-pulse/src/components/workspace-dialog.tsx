import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

export function WorkspaceDialog({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl",
          wide && "sm:max-w-4xl",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <IconButton label="关闭弹窗" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto p-1">{children}</div>
        <DialogFooter>
          {footer ?? <Button onClick={onClose}>完成</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
