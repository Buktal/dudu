import { CircleHelp, MessageCircle, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  requestInboxQueue,
  requestInboxSearch,
} from "../hooks/use-inbox-shortcuts";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadConversations } from "../stores/reading";
import { emptyQuery } from "../stores/state";

const shortcuts = [
  ["Ctrl / ⌘ K", "搜索访客或消息"],
  ["Enter", "发送当前回复"],
  ["Shift + Enter", "换行"],
  ["Ctrl / ⌘ Enter", "发送并接待等待最久的下一位"],
  ["Alt + 1 / 2", "并肩模式切换主窗 / 固定窗口"],
  ["Esc", "关闭当前弹窗"],
];

export function KeyboardHelp() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="使用帮助"
            title="使用帮助与快捷键"
          />
        }
      >
        <CircleHelp data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>工作台帮助</DialogTitle>
          <DialogDescription>接待方式与常用快捷键</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex gap-3">
            <dt className="shrink-0 font-medium">自在</dt>
            <dd className="text-muted-foreground">
              专注一位访客，右侧查看资料。
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="shrink-0 font-medium">并肩</dt>
            <dd className="text-muted-foreground">
              列表切换左窗，右窗固定访客。点击输入框选择回复对象。
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="shrink-0 font-medium">速答</dt>
            <dd className="text-muted-foreground">
              直接在卡片回复，需要上下文时打开完整对话。
            </dd>
          </div>
        </dl>
        <dl className="flex flex-col gap-4 py-2">
          {shortcuts.map(([key, description]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-5 text-sm"
            >
              <dt>{description}</dt>
              <dd>
                <kbd className="rounded-md border bg-muted px-2 py-1 text-xs whitespace-nowrap">
                  {key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          输入法正在选字时，Enter 只确认文字。发送并下一位不会结束当前接待。
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceNavigation() {
  const dispatch = useInboxDispatch();
  const query = useInboxSelector((state) => state.inbox.queue.query);
  return (
    <>
      <ToggleGroup
        orientation="vertical"
        value={[query.starred ? "starred" : "all"]}
        spacing={4}
        size="lg"
        aria-label="选择会话列表"
        onValueChange={(values) => {
          const starred = values[0] === "starred";
          void dispatch(
            loadConversations({
              query: {
                ...emptyQuery,
                order: query.order,
                starred,
                status: starred ? "all" : "active",
              },
            }),
          );
          requestInboxQueue();
        }}
      >
        <ToggleGroupItem
          value="all"
          className="size-10 rounded-lg px-0"
          aria-label="所有会话"
          title="所有会话"
        >
          <MessageCircle data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="starred"
          className="size-10 rounded-lg px-0"
          aria-label="星标会话"
          title="星标会话"
        >
          <Star data-icon="inline-start" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Button
        variant="ghost"
        size="icon-lg"
        className="rounded-lg"
        aria-label="搜索会话"
        title="搜索会话 · Ctrl K"
        onClick={requestInboxSearch}
      >
        <Search data-icon="inline-start" />
      </Button>
    </>
  );
}
