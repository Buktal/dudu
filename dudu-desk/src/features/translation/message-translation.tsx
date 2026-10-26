import { ChevronDown, ChevronUp, Languages, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { InboxMessage } from "@/features/inbox/types";
import { languages, type Translation } from "./api";
import { useTranslation } from "./provider";

export function MessageTranslation({ message }: { message: InboxMessage }) {
  const context = useTranslation();
  return (
    <TranslationContent
      key={`${message.id}:${message.version}:${context?.preference.targetLanguage}`}
      message={message}
    />
  );
}

function TranslationContent({ message }: { message: InboxMessage }) {
  const translation = useTranslation();
  const language = translation?.preference.targetLanguage ?? "zh";
  const automatic = translation?.preference.automatic ?? false;
  const languageName =
    languages.find(([code]) => code === language)?.[1] ?? language;
  const [result, setResult] = useState<Translation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const current = useRef(translation);
  current.current = translation;
  const id = message.serverId ?? message.id;
  const eligible =
    !!translation &&
    /^\d+$/.test(id) &&
    message.body.type === "text" &&
    message.direction !== "system" &&
    (!message.delivery || message.delivery.state === "sent");
  useEffect(() => {
    const run = ++generation.current;
    setResult(null);
    setError(null);
    setPending(false);
    setVisible(true);
    if (!eligible || (!automatic && attempt === 0)) return;
    setPending(true);
    void current.current?.translate(id, message.version, language).then(
      (value) => {
        if (generation.current === run) {
          setResult(value);
          setPending(false);
        }
      },
      (failure) => {
        if (generation.current === run) {
          setError(
            failure instanceof Error ? failure.message : "翻译失败，请重试",
          );
          setPending(false);
        }
      },
    );
    return () => {
      generation.current++;
    };
  }, [id, message.version, language, automatic, eligible, attempt]);
  if (!eligible) return null;
  return (
    <div className="mt-1 flex min-w-0 max-w-full flex-col gap-1 text-xs">
      {result && visible && (
        <section
          className="mt-1 flex min-w-0 flex-col gap-2 border-t border-border/70 pt-2.5"
          aria-label="消息译文"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              译文 · {languageName}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={pending}
              title="重新翻译"
              aria-label="重新翻译"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RotateCcw />
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
            {result.text}
          </p>
          <p
            className="truncate text-[10px] text-muted-foreground"
            title={result.serviceName}
          >
            {result.serviceName}
          </p>
        </section>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          disabled={pending}
          aria-expanded={result ? visible : undefined}
          onClick={() => {
            if (result) setVisible((value) => !value);
            else setAttempt((value) => value + 1);
          }}
        >
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : result ? (
            visible ? (
              <ChevronUp data-icon="inline-start" />
            ) : (
              <ChevronDown data-icon="inline-start" />
            )
          ) : (
            <Languages data-icon="inline-start" />
          )}
          {pending
            ? "翻译中…"
            : result
              ? visible
                ? "收起译文"
                : "显示译文"
              : error
                ? "重试翻译"
                : "翻译"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
