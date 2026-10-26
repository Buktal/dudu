import {
  ArrowDownLeft,
  BookOpen,
  FileText,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Message, MessageContent } from "@/components/ui/message";
import type { AssistantState, AssistantTarget } from "./use-assistant";

export function AssistantMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        large
          ? "inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground"
          : "inline-flex size-5 shrink-0 items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground"
      }
    >
      <span className="h-1.5 w-0.5 rounded-full bg-current" />
      <span className="h-1.5 w-0.5 rounded-full bg-current" />
    </span>
  );
}

export function AssistantThread({
  assistant,
  target,
  draft,
}: {
  assistant: AssistantState;
  target: AssistantTarget | undefined;
  draft: string;
}) {
  if (!target)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>先选择一位来访用户</EmptyTitle>
          <EmptyDescription>助手会结合当前授权会话提供协助</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (!assistant.thread.exchanges.length)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <Empty className="px-0 py-5">
          <EmptyHeader>
            <AssistantMark large />
            <EmptyTitle>这段对话，想让我帮你做什么？</EmptyTitle>
            <EmptyDescription>了解来意，一起组织下一句回复</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            disabled={!assistant.availability?.enabled}
            onClick={() =>
              assistant.ask(
                "总结当前会话，区分当前事项、已知情况和待确认信息",
                "summary",
              )
            }
          >
            <FileText data-icon="inline-start" />
            帮我了解这次咨询
          </Button>
          <Button
            variant="outline"
            disabled={!assistant.availability?.enabled}
            onClick={() =>
              assistant.ask("根据当前会话帮我拟一条合适的回复", "reply")
            }
          >
            <Sparkles data-icon="inline-start" />
            下一句怎么回复？
          </Button>
          <Button
            variant="outline"
            disabled={!assistant.availability?.enabled || !draft.trim()}
            onClick={() =>
              assistant.ask(
                "请润色当前回复草稿，保持事实和承诺不变，让语气更礼貌自然",
                "reply",
              )
            }
          >
            <BookOpen data-icon="inline-start" />
            润色当前草稿
          </Button>
        </div>
      </div>
    );
  return (
    <div className="min-h-0 flex-1">
      <Virtuoso
        key={target.id}
        data={assistant.thread.exchanges}
        computeItemKey={(_, exchange) => exchange.id}
        followOutput="auto"
        initialTopMostItemIndex={assistant.thread.exchanges.length - 1}
        itemContent={(index, exchange) => (
          <div className="flex flex-col gap-4 px-4 py-3">
            <Message align="end">
              <MessageContent>
                <Bubble variant="secondary" align="end">
                  <BubbleContent>{exchange.prompt}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
            {exchange.status === "pending" && (
              <div
                role="status"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                正在整理 {target.name} 的会话…
              </div>
            )}
            {exchange.status === "cancelled" && (
              <p className="text-xs text-muted-foreground">已取消生成</p>
            )}
            {exchange.error && (
              <Alert>
                <AlertDescription>{exchange.error}</AlertDescription>
              </Alert>
            )}
            {(exchange.status === "error" || exchange.status === "cancelled") &&
              index === assistant.thread.exchanges.length - 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assistant.pending}
                  onClick={() =>
                    assistant.ask(exchange.prompt, exchange.task, exchange.id)
                  }
                >
                  <RefreshCw data-icon="inline-start" />
                  重新生成
                </Button>
              )}
            {exchange.answer && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <AssistantMark />
                  AI 助手
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {exchange.answer.text}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  参考 {exchange.answer.contextMessageCount} 条已保存文本
                  {exchange.answer.contextTruncated ? " · 仅包含部分历史" : ""}{" "}
                  · {exchange.answer.serviceName}
                </p>
                {exchange.task === "reply" && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        assistant.apply(exchange.answer?.text ?? "")
                      }
                    >
                      <ArrowDownLeft data-icon="inline-start" />
                      {draft ? "替换回复草稿" : "放入回复草稿"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={assistant.pending}
                      onClick={() =>
                        assistant.ask(
                          "上一条建议再简短一点，保持事实和承诺不变",
                          "reply",
                        )
                      }
                    >
                      再简短一点
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      />
    </div>
  );
}
