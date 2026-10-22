import { cn } from "@/lib/utils";

/**
 * 操作失败时的行内提示：无消息不渲染，文案外的结构与配色在单点收口
 */
export function InlineActionError({
  message,
  className,
}: {
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <span role="status" className={cn("text-xs text-destructive", className)}>
      {message}
    </span>
  );
}
