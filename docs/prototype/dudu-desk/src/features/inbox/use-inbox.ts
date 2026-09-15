import { useCallback, useRef, useState } from "react";
import { nowTime } from "../../lib/time";
import type { Message, Visitor } from "../../types";
import { getConversations } from "./api";

export function useInbox() {
  const [visitors, setVisitors] = useState(getConversations);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [failFor, setFailFor] = useState<string | null>(null);
  const counter = useRef(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVisitors = useRef(visitors);
  latestVisitors.current = visitors;

  function notify(text: string) {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4200);
  }
  function patch(id: string, change: Partial<Visitor>) {
    setVisitors((items) =>
      items.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }
  function updateDraft(id: string, text: string) {
    setDrafts((value) => ({ ...value, [id]: text }));
  }
  const markRead = useCallback((id: string) => {
    setVisitors((items) =>
      items.some((item) => item.id === id && item.unread > 0)
        ? items.map((item) => (item.id === id ? { ...item, unread: 0 } : item))
        : items,
    );
  }, []);
  function send(
    id: string,
    text: string,
    kind: Message["kind"] = "text",
    onSuccess?: () => void,
  ) {
    const visitor = visitors.find((item) => item.id === id);
    if (!visitor?.replyOpen || visitor.status === "ended" || !text.trim())
      return;
    const fail = failFor === id;
    const messageId = `sent-${++counter.current}`;
    const version = generation.current;
    const message: Message = {
      id: messageId,
      role: "agent",
      kind,
      text: text.trim(),
      time: nowTime(),
      status: "sending",
    };
    if (fail) setFailFor(null);
    setVisitors((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, messages: [...item.messages, message], unread: 0 }
          : item,
      ),
    );
    if (kind === "text") updateDraft(id, "");
    setTimeout(() => {
      if (generation.current !== version) return;
      const latest = latestVisitors.current.find((item) => item.id === id);
      const sentIndex =
        latest?.messages.findIndex((entry) => entry.id === messageId) ?? -1;
      const newIncoming = latest?.messages
        .slice(sentIndex + 1)
        .some((entry) => entry.role === "visitor");
      setVisitors((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status:
                  item.status === "ended"
                    ? "ended"
                    : fail || newIncoming
                      ? "needs-reply"
                      : "waiting",
                wait: fail || newIncoming ? item.wait : 0,
                messages: item.messages.map((entry) =>
                  entry.id === messageId
                    ? { ...entry, status: fail ? "failed" : "sent" }
                    : entry,
                ),
              }
            : item,
        ),
      );
      if (fail) notify(`未能发送给 ${visitor.name}，可在消息旁重试`);
      else if (!newIncoming && latest?.status !== "ended") onSuccess?.();
    }, 480);
  }
  function retry(id: string, messageId: string) {
    const visitor = visitors.find((item) => item.id === id);
    if (!visitor?.replyOpen || visitor.status === "ended") {
      notify("当前会话不能回复，请等待访客发来新消息");
      return;
    }
    const version = generation.current;
    setVisitors((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              messages: item.messages.map((message) =>
                message.id === messageId
                  ? { ...message, status: "sending" }
                  : message,
              ),
            }
          : item,
      ),
    );
    setTimeout(() => {
      if (generation.current !== version) return;
      const latest = latestVisitors.current.find((item) => item.id === id);
      const retriedIndex =
        latest?.messages.findIndex((message) => message.id === messageId) ?? -1;
      const newIncoming = latest?.messages
        .slice(retriedIndex + 1)
        .some((message) => message.role === "visitor");
      setVisitors((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                status:
                  item.status === "ended"
                    ? "ended"
                    : newIncoming
                      ? "needs-reply"
                      : "waiting",
                wait: newIncoming ? item.wait : 0,
                messages: item.messages.map((message) =>
                  message.id === messageId
                    ? { ...message, status: "sent" }
                    : message,
                ),
              }
            : item,
        ),
      );
      notify("消息已重新发送");
    }, 450);
  }
  function receive(id: string, text = "我又看了一下，想再确认一个小细节。") {
    const message: Message = {
      id: `received-${++counter.current}`,
      role: "visitor",
      kind: "text",
      text,
      time: nowTime(),
    };
    setVisitors((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "needs-reply",
              replyOpen: true,
              unread: item.unread + 1,
              wait: Math.max(item.wait, 8),
              messages: [...item.messages, message],
            }
          : item,
      ),
    );
    notify("收到一条新消息，当前回复对象保持不变");
  }
  function reset() {
    generation.current += 1;
    setVisitors(getConversations());
    setDrafts({});
    setFailFor(null);
    notify("演示已恢复到初始状态");
  }
  return {
    visitors,
    drafts,
    toast,
    failFor,
    patch,
    updateDraft,
    markRead,
    send,
    retry,
    receive,
    reset,
    notify,
    setFailFor,
  };
}
export type Inbox = ReturnType<typeof useInbox>;
