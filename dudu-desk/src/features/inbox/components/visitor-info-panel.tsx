import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkspacePanel } from "@/components/workspace-motion";
import { VisitorInfo } from "./visitor-info";

export function VisitorInfoPanel({
  conversationId,
  open,
  inline,
  onOpenChange,
}: {
  conversationId: string | null;
  open: boolean;
  inline: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!conversationId) return null;
  if (inline)
    return (
      <WorkspacePanel
        side="right"
        open={open}
        className="rounded-l-3xl [--workspace-panel-width:286px] max-[1360px]:[--workspace-panel-width:264px]"
      >
        <VisitorInfo conversationId={conversationId} />
      </WorkspacePanel>
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="data-[side=right]:w-[min(380px,90vw)]"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>来访资料</SheetTitle>
          <SheetDescription>当前回复对象的渠道资料与接待记录</SheetDescription>
        </SheetHeader>
        <VisitorInfo
          conversationId={conversationId}
          closeAction={
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="关闭来访资料"
                  title="关闭来访资料"
                />
              }
            >
              <X data-icon="inline-start" />
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
