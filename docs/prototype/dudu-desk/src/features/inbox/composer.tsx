import {
  ArrowUp,
  ArrowUpRight,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  MessageSquareText,
  Smile,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BagIllustration, SourceLogo } from "../../components/identity";
import { Button, IconButton } from "../../components/primitives";
import { channels, type Visitor } from "../../types";
import type { Inbox } from "./use-inbox";

const replies = [
  {
    label: "先回应一下",
    text: "你好，收到你的消息了，我正在帮你确认，请稍等一下～",
  },
  {
    label: "发货时间",
    text: "现货通常会在 48 小时内发出，发出后可以在原渠道查看物流。",
  },
  {
    label: "尺寸说明",
    text: "这款包宽 36cm、高 28cm、底宽 12cm，可以放下 13 寸电脑。",
  },
  { label: "结束前确认", text: "还有其他想了解的吗？我都可以帮你看看。" },
];

export function Composer({
  visitor,
  inbox,
  onNext,
  onFocus,
  focusMode = false,
}: {
  visitor: Visitor;
  inbox: Inbox;
  onNext: (fromId: string) => void;
  onFocus: () => void;
  focusMode?: boolean;
}) {
  const [popup, setPopup] = useState<"quick" | "emoji" | "attachment" | null>(
    null,
  );
  const composerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popup) return;
    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setPopup(null);
      } else if (!composerRef.current?.contains(event.target as Node)) {
        setPopup(null);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [popup]);
  const draft = inbox.drafts[visitor.id] ?? "";
  const source = channels[visitor.channel];
  const ended = visitor.status === "ended";
  const blocked = !visitor.replyOpen || ended;
  const canSendFile =
    visitor.channel === "whatsapp" || visitor.channel === "telegram";
  function send(next = false) {
    if (blocked || !draft.trim()) return;
    inbox.send(
      visitor.id,
      draft,
      "text",
      next ? () => onNext(visitor.id) : undefined,
    );
    setPopup(null);
  }
  function insert(text: string) {
    inbox.updateDraft(visitor.id, `${draft}${draft ? "\n" : ""}${text}`);
    setPopup(null);
  }
  return (
    <div
      ref={composerRef}
      className={`composer ${blocked ? "composer-blocked" : ""}`}
    >
      {blocked && (
        <div className="reply-limit">
          <LockKeyhole size={15} />
          <div>
            <strong>{ended ? "本次接待已结束" : "已超出自由回复时间"}</strong>
            <p>
              {ended
                ? "会话记录和草稿仍然保留。"
                : "WhatsApp 24 小时自由回复窗口已关闭，等待访客再次发来消息后继续。"}
            </p>
          </div>
          {ended && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => inbox.patch(visitor.id, { status: "needs-reply" })}
            >
              继续接待
            </Button>
          )}
        </div>
      )}
      <AnimatePresence>
        {popup && !blocked && (
          <motion.div
            key={popup}
            initial={{ opacity: 0, y: 9, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={`composer-popup popup-${popup}`}
            role="dialog"
            aria-label={
              popup === "quick"
                ? "快捷回复"
                : popup === "emoji"
                  ? "选择表情"
                  : "发送示例附件"
            }
          >
            <div className="popup-heading">
              <strong>
                {popup === "quick"
                  ? "快捷回复"
                  : popup === "emoji"
                    ? "表情"
                    : "示例附件"}
              </strong>
              <IconButton
                icon={X}
                label="收起面板"
                onClick={() => setPopup(null)}
              />
            </div>
            {popup === "quick" && (
              <div className="quick-replies">
                {replies.map((reply) => (
                  <button
                    key={reply.label}
                    type="button"
                    onClick={() => insert(reply.text)}
                  >
                    <strong>{reply.label}</strong>
                    <span>{reply.text}</span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            )}
            {popup === "emoji" && (
              <div className="emoji-grid">
                {["😊", "👋", "👌", "🌷", "✨", "🙏", "💛", "🎉"].map(
                  (emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`插入表情 ${emoji}`}
                      onClick={() => {
                        inbox.updateDraft(visitor.id, `${draft}${emoji}`);
                        setPopup(null);
                      }}
                    >
                      {emoji}
                    </button>
                  ),
                )}
              </div>
            )}
            {popup === "attachment" && (
              <div className="attachment-choice">
                <BagIllustration />
                <div>
                  <strong>米白色 · 云朵包</strong>
                  <small>演示图片</small>
                  <Button
                    size="sm"
                    onClick={() => {
                      inbox.send(visitor.id, "米白色云朵包实拍", "image");
                      setPopup(null);
                    }}
                  >
                    发送这张图片
                  </Button>
                </div>
                {canSendFile && (
                  <button
                    type="button"
                    className="attachment-file"
                    onClick={() => {
                      inbox.send(visitor.id, "帆布包保养说明.pdf", "file");
                      setPopup(null);
                    }}
                  >
                    <FileText size={16} />
                    发送保养说明
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="composer-editor">
        <div className="composer-toolbar">
          <div>
            <IconButton
              icon={Smile}
              label="选择表情"
              active={popup === "emoji"}
              disabled={blocked}
              onClick={() => setPopup(popup === "emoji" ? null : "emoji")}
            />
            <IconButton
              icon={ImageIcon}
              label="发送图片或附件"
              active={popup === "attachment"}
              disabled={blocked}
              onClick={() =>
                setPopup(popup === "attachment" ? null : "attachment")
              }
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={blocked}
              aria-expanded={popup === "quick"}
              onClick={() => setPopup(popup === "quick" ? null : "quick")}
            >
              <MessageSquareText data-icon="inline-start" />
              快捷回复
            </Button>
          </div>
          <span className="reply-target" style={{ color: source.color }}>
            <SourceLogo channel={visitor.channel} />
            <span>
              回复给 <b>{visitor.name}</b> · {source.short}
            </span>
          </span>
        </div>
        <textarea
          aria-label={`回复 ${visitor.name}`}
          placeholder={
            blocked ? "当前会话暂不可发送消息" : `回复 ${visitor.name}…`
          }
          value={draft}
          disabled={blocked}
          onFocus={onFocus}
          onChange={(event) =>
            inbox.updateDraft(visitor.id, event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              send(event.ctrlKey || event.metaKey);
            }
          }}
        />
        <div className="composer-bottom">
          <span className="composer-hint">
            Enter 发送<span> · Shift + Enter 换行</span>
          </span>
          <div className="send-actions">
            {focusMode ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={blocked || !draft.trim()}
                  onClick={() => send()}
                >
                  仅发送
                </Button>
                <Button
                  size="sm"
                  disabled={blocked || !draft.trim()}
                  onClick={() => send(true)}
                >
                  发送并接待下一位
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="发送并接待下一位 · Ctrl + Enter"
                  aria-label={`发送给 ${visitor.name} 并接待下一位`}
                  disabled={blocked || !draft.trim()}
                  onClick={() => send(true)}
                >
                  <ArrowUpRight data-icon="inline-start" />
                </Button>
                <Button
                  size="sm"
                  disabled={blocked || !draft.trim()}
                  onClick={() => send()}
                >
                  发送
                  <ArrowUp data-icon="inline-end" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
