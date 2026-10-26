import {
  ArrowUp,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCw,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { MAX_PROMPT_LENGTH } from "./api";
import { AssistantMark, AssistantThread } from "./assistant-thread";
import { type AssistantTarget, useAssistant } from "./use-assistant";

export function FloatingAssistant({
  target,
  draft,
  onApply,
  container,
}: {
  target: AssistantTarget | undefined;
  draft: string;
  onApply: (visitorId: string, text: string, expectedDraft: string) => boolean;
  container?: HTMLElement | null;
}) {
  const assistant = useAssistant(target, draft, onApply);
  const [wide, setWide] = useState(false);
  const [left, setLeft] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (assistant.open && assistant.availability?.enabled)
      input.current?.focus();
  }, [assistant.open, assistant.availability?.enabled]);
  function close() {
    assistant.setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        assistant.setOpen(!assistant.open);
      } else if (event.key === "Escape" && assistant.open) close();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  const enabled = !!target && !!assistant.availability?.enabled;
  const content = (
    <div
      className={cn(
        "pointer-events-none inset-0 z-30",
        container ? "absolute" : "fixed",
      )}
    >
      {assistant.open && (
        <section
          id="desk-ai-assistant"
          data-desk-assistant=""
          aria-label="AI 助手"
          onKeyDownCapture={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          className={cn(
            "pointer-events-auto absolute bottom-[84px] flex w-[min(410px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border bg-popover text-popover-foreground shadow-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
            container
              ? "h-[min(640px,calc(100%-100px))]"
              : "h-[min(640px,calc(100dvh-112px))]",
            left ? "left-4" : "right-4",
            wide && "w-[min(690px,calc(100vw-24px))]",
            "max-[760px]:right-3 max-[760px]:left-3 max-[760px]:w-auto",
          )}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <AssistantMark />
              <div>
                <h2 className="text-sm font-medium">AI 助手</h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  接待时，和你一起想
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="新建 AI 对话"
                title="新建 AI 对话"
                disabled={!target}
                onClick={assistant.clear}
              >
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={wide ? "恢复小窗" : "展开大窗"}
                title={wide ? "恢复小窗" : "展开大窗"}
                onClick={() => setWide(!wide)}
              >
                {wide ? <Minimize2 /> : <Maximize2 />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="收起 AI 助手"
                title="收起 AI 助手"
                onClick={close}
              >
                <Minus />
              </Button>
            </div>
          </header>
          <div className="mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {target ? `正在协助接待 ${target.name}` : "尚未选择来访用户"}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {target
                  ? `${target.channel} · 读取近期文本、标签、内部备注与本次草稿`
                  : "请选择一段会话后开始"}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              跟随会话
            </span>
          </div>
          {assistant.loading && (
            <div
              role="status"
              className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"
            >
              <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
              正在读取 AI 服务配置…
            </div>
          )}
          {(assistant.configError ||
            assistant.availability?.enabled === false) && (
            <div className="px-3 pb-2">
              <Alert>
                <AlertDescription>
                  {assistant.configError ??
                    "企业尚未启用 AI 助手，请联系初始企业管理员在“AI 与翻译服务”中选择模型服务"}
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={assistant.loading}
                    onClick={assistant.refresh}
                  >
                    <RefreshCw data-icon="inline-start" />
                    刷新状态
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          )}
          <AssistantThread
            assistant={assistant}
            target={target}
            draft={draft}
          />
          {assistant.thread.exchanges.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-0.5 px-3 py-1">
              <Button
                variant="ghost"
                size="xs"
                disabled={!enabled || assistant.pending}
                onClick={() =>
                  assistant.ask(
                    "结合当前会话与之前讨论，帮我拟一条对外回复",
                    "reply",
                  )
                }
              >
                拟一条回复
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={!enabled || assistant.pending}
                onClick={() =>
                  assistant.ask(
                    "将上一条建议或当前草稿调整得更礼貌，保持事实与承诺不变",
                    "reply",
                  )
                }
              >
                更礼貌
              </Button>
              <Button
                variant="ghost"
                size="xs"
                disabled={!enabled || assistant.pending}
                onClick={() =>
                  assistant.ask(
                    "将上一条建议或当前草稿翻译成英文，保持原意",
                    "reply",
                  )
                }
              >
                改成英文
              </Button>
            </div>
          )}
          <form
            className="shrink-0 px-3 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              assistant.ask(assistant.thread.question);
            }}
          >
            <InputGroup>
              <InputGroupTextarea
                ref={input}
                aria-label="向 AI 提问"
                placeholder="继续提问，或描述你想怎么回复…"
                maxLength={MAX_PROMPT_LENGTH}
                disabled={!enabled}
                value={assistant.thread.question}
                onChange={(event) => assistant.editQuestion(event.target.value)}
                className="min-h-14 max-h-28"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.repeat &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    assistant.ask(assistant.thread.question);
                  }
                }}
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <span className="text-[10px] font-normal">
                  {assistant.pending
                    ? "可收起助手并继续接待"
                    : "AI 对话仅供坐席内部使用"}
                </span>
                {assistant.pending ? (
                  <InputGroupButton onClick={assistant.cancel}>
                    停止生成
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-sm"
                    aria-label="发送给 AI"
                    disabled={!enabled || !assistant.thread.question.trim()}
                  >
                    <ArrowUp />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              AI 可能出错，采纳前请核对事实与承诺
            </p>
          </form>
          <footer className="flex shrink-0 items-center justify-between gap-2 px-3 pt-1 pb-2">
            <Button variant="ghost" size="xs" onClick={() => setLeft(!left)}>
              移到{left ? "右" : "左"}侧
            </Button>
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[10px] text-muted-foreground">
                {assistant.availability?.serviceName ?? "企业模型服务"}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="刷新 AI 服务状态"
                title="刷新 AI 服务状态"
                disabled={assistant.loading || assistant.pending}
                onClick={assistant.refresh}
              >
                <RefreshCw />
              </Button>
            </div>
          </footer>
        </section>
      )}
      {!assistant.open && assistant.canUndo && (
        <div
          role="status"
          className={cn(
            "pointer-events-auto absolute bottom-[84px] flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
            left ? "left-4" : "right-4",
          )}
        >
          <span>已放入 {target?.name} 的草稿</span>
          <Button variant="ghost" size="xs" onClick={assistant.undo}>
            <Undo2 data-icon="inline-start" />
            撤销
          </Button>
        </div>
      )}
      <div
        className={cn(
          "pointer-events-auto absolute bottom-5 flex items-center gap-2.5",
          left ? "left-4 flex-row-reverse" : "right-4",
        )}
      >
        <span className="rounded-lg border bg-popover px-2.5 py-1 text-[11px] text-muted-foreground">
          {assistant.open ? "收起助手" : "AI 助手"}
        </span>
        <Button
          ref={trigger}
          size="icon-lg"
          aria-label={assistant.open ? "收起悬浮 AI 助手" : "展开悬浮 AI 助手"}
          aria-expanded={assistant.open}
          aria-controls={assistant.open ? "desk-ai-assistant" : undefined}
          onClick={() => assistant.setOpen(!assistant.open)}
        >
          {assistant.open ? <X /> : <AssistantMark />}
        </Button>
      </div>
    </div>
  );
  return container ? createPortal(content, container) : content;
}
