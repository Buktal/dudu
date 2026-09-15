import { Check, CheckCheck, FileText, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Avatar, BagIllustration } from "../../components/identity";
import { Button, Modal } from "../../components/primitives";
import type { Message, Visitor } from "../../types";

export function MessageView({
  message,
  visitor,
  onRetry,
}: {
  message: Message;
  visitor: Visitor;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const outgoing = message.role === "agent";
  return (
    <motion.div
      className={`message-row ${outgoing ? "outgoing" : "incoming"}`}
      initial={
        message.id.startsWith("sent-") || message.id.startsWith("received-")
          ? { opacity: 0, y: 9, scale: 0.98 }
          : false
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
    >
      {!outgoing && <Avatar visitor={visitor} size="small" badge={false} />}
      <div className="message-stack">
        <div className={`message-bubble message-${message.kind}`}>
          {message.kind === "product" ? (
            <div className="product-card">
              <BagIllustration />
              <div>
                <small>访客分享的商品</small>
                <strong>{message.text}</strong>
                <span>米白 / 雾灰 · 轻量帆布</span>
                <b>
                  ¥ 169<span className="product-price-decimal">.00</span>
                </b>
              </div>
            </div>
          ) : message.kind === "image" ? (
            <button
              type="button"
              className="image-message"
              onClick={() => setImageOpen(true)}
              aria-label="放大查看包包图片"
            >
              <BagIllustration large />
              <span>
                查看图片 <span>↗</span>
              </span>
            </button>
          ) : message.kind === "voice" ? (
            <div className="voice-message">
              <div className="waveform" aria-hidden="true">
                {[
                  6, 13, 20, 11, 25, 16, 9, 18, 26, 13, 21, 8, 17, 23, 10, 6,
                ].map((height, index) => (
                  <i key={`wave-${index}-${height}`} style={{ height }} />
                ))}
                <span>12″</span>
              </div>
              <button type="button" onClick={() => setExpanded(!expanded)}>
                {expanded ? "收起文字" : "查看语音文字"}
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.p
                    className="transcript"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    {message.text}
                    <small>演示转写文本</small>
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          ) : message.kind === "file" ? (
            <div className="file-message">
              <FileText size={28} />
              <div>
                <strong>{message.text}</strong>
                <small>消息附件 · 演示文件</small>
              </div>
            </div>
          ) : message.kind === "unsupported" ? (
            <div className="unsupported-message">
              <FileText size={20} />
              <strong>暂不支持预览的消息</strong>
              <span>{message.text}</span>
            </div>
          ) : (
            <p>{message.text}</p>
          )}
        </div>
        <div
          className={`message-meta ${message.status === "failed" ? "message-failed" : ""}`}
        >
          <time>{message.time}</time>
          {outgoing &&
            (message.status === "failed" ? (
              <button type="button" onClick={onRetry}>
                <RotateCcw size={11} />
                发送失败 · 重试
              </button>
            ) : message.status === "sending" ? (
              <span>发送中…</span>
            ) : message.status === "read" ? (
              <>
                <CheckCheck size={12} />
                <span>已读</span>
              </>
            ) : (
              <>
                <Check size={12} />
                <span>已发送</span>
              </>
            ))}
        </div>
      </div>
      <AnimatePresence>
        {imageOpen && (
          <Modal title="图片消息" onClose={() => setImageOpen(false)}>
            <div className="image-preview">
              <BagIllustration large />
            </div>
            <p className="dialog-caption">
              原型示意插画，正式接入后显示访客发送的原图。
            </p>
            <Button variant="outline" onClick={() => setImageOpen(false)}>
              关闭图片
            </Button>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
