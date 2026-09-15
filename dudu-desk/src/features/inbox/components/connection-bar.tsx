import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { reconnectInbox } from "../stores/events";
import type { ConnectionState } from "../types";

const labels: Record<ConnectionState, string> = {
  unavailable: "接待服务未连接",
  connecting: "正在连接接待服务",
  connected: "接待服务已连接",
  reconnecting: "正在重新连接",
  disconnected: "连接已中断，草稿已保留",
};

export function ConnectionBar() {
  const dispatch = useInboxDispatch();
  const connection = useInboxSelector((state) => state.inbox.connection);
  return (
    <footer className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 px-1 pb-2 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-1.5" role="status">
        <span
          className={
            connection === "connected"
              ? "size-1.5 rounded-full bg-success"
              : "size-1.5 rounded-full bg-muted-foreground"
          }
        />
        <span>{labels[connection]}</span>
        {(connection === "unavailable" || connection === "disconnected") && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void dispatch(reconnectInbox())}
          >
            <RefreshCw />
            重新连接
          </Button>
        )}
      </div>
      <span>
        {import.meta.env.DEV && import.meta.env.VITE_DESK_MOCK === "true"
          ? "开发联调 · 数据与收发仅用于验证"
          : "专注每一次对话"}
      </span>
    </footer>
  );
}
