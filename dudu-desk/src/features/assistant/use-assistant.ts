import { useEffect, useRef, useState } from "react";
import {
  type AssistantAnswer,
  type AssistantRequest,
  type AssistantTask,
  type Availability,
  assistantApi,
  MAX_PROMPT_LENGTH,
} from "./api";

export type AssistantTarget = { id: string; name: string; channel: string };
export type Exchange = {
  id: number;
  prompt: string;
  task: AssistantTask;
  status: "pending" | "ready" | "error" | "cancelled";
  answer?: AssistantAnswer;
  error?: string;
};
type Thread = {
  question: string;
  exchanges: Exchange[];
  undo?: { before: string; applied: string };
};
const EMPTY_THREAD: Thread = { question: "", exchanges: [] };
const MAX_EXCHANGES = 20;
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_CHARACTERS = 24000;
const MAX_CONCURRENT_VISITORS = 2;

export function historyFor(exchanges: Exchange[]): AssistantRequest["history"] {
  const pairs = exchanges
    .filter((item) => item.status === "ready" && item.answer)
    .slice(-MAX_HISTORY_TURNS / 2);
  let characters = 0;
  const history: AssistantRequest["history"] = [];
  for (const pair of [...pairs].reverse()) {
    const text = pair.answer?.text ?? "";
    characters += pair.prompt.length + text.length;
    if (characters > MAX_HISTORY_CHARACTERS) break;
    history.unshift(
      { role: "user", content: pair.prompt },
      { role: "assistant", content: text },
    );
  }
  return history;
}

export function useAssistant(
  target: AssistantTarget | undefined,
  draft: string,
  onApply: (visitorId: string, text: string, expectedDraft: string) => boolean,
) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [configuration, setConfiguration] = useState<{
    data: Availability | null;
    attempt: number;
  }>({ data: null, attempt: 0 });
  const availability = configuration.data;
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef(new Map<string, AbortController>());
  const sequence = useRef(0);
  const alive = useRef(true);
  const id = target?.id;
  const thread = id ? (threads[id] ?? EMPTY_THREAD) : EMPTY_THREAD;
  const pending = thread.exchanges.some((item) => item.status === "pending");
  const controllers = active.current;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, [controllers]);
  useEffect(() => {
    if (!open || configuration.data) return;
    const controller = new AbortController();
    setLoading(true);
    setConfigError(null);
    void assistantApi.availability(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setConfiguration({ ...configuration, data: value });
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setConfigError(
            error instanceof Error ? error.message : "AI 服务状态加载失败",
          );
          setLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [open, configuration]);

  function change(visitorId: string, action: (value: Thread) => Thread) {
    setThreads((previous) => ({
      ...previous,
      [visitorId]: action(previous[visitorId] ?? EMPTY_THREAD),
    }));
  }
  function ask(prompt: string, task: AssistantTask = "chat", retryId?: number) {
    const question = prompt.trim();
    if (
      !id ||
      !question ||
      question.length > MAX_PROMPT_LENGTH ||
      controllers.has(id) ||
      !availability?.enabled
    )
      return;
    if (controllers.size >= MAX_CONCURRENT_VISITORS) {
      change(id, (value) => ({ ...value, question }));
      setConfigError("正在协助其他会话，请等待生成完成后重试");
      return;
    }
    setConfigError(null);
    const visitorId = id;
    const controller = new AbortController();
    controllers.set(visitorId, controller);
    const exchangeId = retryId ?? ++sequence.current;
    const prior =
      retryId === undefined
        ? thread.exchanges
        : thread.exchanges.slice(
            0,
            thread.exchanges.findIndex((item) => item.id === retryId),
          );
    const exchange: Exchange = {
      id: exchangeId,
      prompt: question,
      task,
      status: "pending",
    };
    change(visitorId, (value) => ({
      ...value,
      question: "",
      exchanges:
        retryId === undefined
          ? [...value.exchanges, exchange].slice(-MAX_EXCHANGES)
          : value.exchanges.map((item) =>
              item.id === retryId ? exchange : item,
            ),
    }));
    void assistantApi
      .ask(
        visitorId,
        { prompt: question, task, draft, history: historyFor(prior) },
        controller.signal,
      )
      .then(
        (answer) => {
          if (!alive.current || controller.signal.aborted) return;
          change(visitorId, (value) => ({
            ...value,
            exchanges: value.exchanges.map((item) =>
              item.id === exchangeId
                ? { ...item, status: "ready", answer }
                : item,
            ),
          }));
        },
        (error: unknown) => {
          if (!alive.current || controller.signal.aborted) return;
          change(visitorId, (value) => ({
            ...value,
            exchanges: value.exchanges.map((item) =>
              item.id === exchangeId
                ? {
                    ...item,
                    status: "error",
                    error:
                      error instanceof Error
                        ? error.message
                        : "AI 生成失败，请重试",
                  }
                : item,
            ),
          }));
        },
      )
      .finally(() => {
        if (controllers.get(visitorId) === controller)
          controllers.delete(visitorId);
      });
  }
  function cancel() {
    if (!id) return;
    controllers.get(id)?.abort();
    controllers.delete(id);
    change(id, (value) => ({
      ...value,
      exchanges: value.exchanges.map((item) =>
        item.status === "pending" ? { ...item, status: "cancelled" } : item,
      ),
    }));
  }
  function clear() {
    if (!id) return;
    cancel();
    change(id, () => EMPTY_THREAD);
  }
  function apply(text: string) {
    if (!id || !onApply(id, text, draft)) return;
    change(id, (value) => ({
      ...value,
      undo: { before: draft, applied: text },
    }));
    setOpen(false);
  }
  function undo() {
    if (
      !id ||
      !thread.undo ||
      draft !== thread.undo.applied ||
      !onApply(id, thread.undo.before, draft)
    )
      return;
    change(id, (value) => ({ ...value, undo: undefined }));
  }
  return {
    open,
    setOpen,
    thread,
    pending,
    availability,
    loading,
    configError,
    ask,
    cancel,
    clear,
    apply,
    undo,
    canUndo: !!thread.undo && draft === thread.undo.applied,
    refresh: () => {
      setConfiguration((value) => ({ data: null, attempt: value.attempt + 1 }));
    },
    editQuestion: (question: string) => {
      if (id) change(id, (value) => ({ ...value, question }));
    },
  };
}
export type AssistantState = ReturnType<typeof useAssistant>;
