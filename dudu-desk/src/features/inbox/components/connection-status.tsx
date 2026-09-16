import { LoaderCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { reconnectInbox } from "../stores/events";

export function ConnectionStatus() {
  const dispatch = useInboxDispatch();
  const connection = useInboxSelector((state) => state.inbox.connection);
  if (connection === "connected") return null;
  const busy = connection === "connecting" || connection === "reconnecting";
  const label = busy ? "正在连接接待服务" : "连接中断，点击重新连接";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={busy ? "ghost" : "destructive"}
            size="icon-sm"
            disabled={busy}
            aria-label={label}
            onClick={() => void dispatch(reconnectInbox())}
          />
        }
      >
        {busy ? (
          <LoaderCircle
            data-icon="inline-start"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <WifiOff data-icon="inline-start" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
