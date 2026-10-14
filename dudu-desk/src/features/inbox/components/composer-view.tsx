import { ArrowUp, ArrowUpRight, History, LockKeyhole } from "lucide-react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { VisitorIdentity } from "../types";
import { AttachmentDrafts } from "./attachment-drafts";
import { ComposerTools } from "./composer-tools";
import { SourceBadge } from "./identity";

/** Resolved display data. Pure derivation from the store snapshot + the
 *  Reply pipeline answer; no hooks, no dispatches. */
export type ComposerViewModel = {
  id: string;
  conversationId: string;
  compact: boolean;
  target: string;
  name: string;
  identity: VisitorIdentity;
  notice: string | null;
  ended: boolean;
  resumeDisabled: boolean;
  resuming: boolean;
  draftText: string;
  hasAttachments: boolean;
  busy: boolean;
  disabled: boolean;
  onHistory?: () => void;
};

/** Behavior callbacks owned by the store-connected container. */
export type ComposerViewActions = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onFocus: () => void;
  onInsert: (text: string) => void;
  onChangeText: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onResume: () => void;
  onSubmit: (next: boolean) => void;
};

/**
 * Pure Composer view: renders the notice, editor and footer from a resolved
 * model. All store reads, pipeline decisions and dispatches live in
 * `composer.tsx`; this module stays importable without a store.
 */
export function ComposerView({
  view,
  actions,
}: {
  view: ComposerViewModel;
  actions: ComposerViewActions;
}) {
  const {
    id,
    conversationId,
    compact,
    target,
    name,
    identity,
    notice,
    ended,
    resumeDisabled,
    resuming,
    draftText,
    hasAttachments,
    busy,
    disabled,
    onHistory,
  } = view;
  return (
    <Field
      className={cn(
        "shrink-0 gap-2 px-3 pt-2 pb-3 max-[760px]:px-2",
        compact && "px-4 pt-0 pb-3",
      )}
    >
      <FieldLabel className="sr-only" htmlFor={id}>
        回复 {target}
      </FieldLabel>
      {notice && (
        <Alert
          role="status"
          className="rounded-lg px-3 py-2"
          id={`${id}-notice`}
        >
          <LockKeyhole />
          <AlertTitle>
            {ended ? "本次接待已结束" : "当前暂时无法发送"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs">
              {ended ? "记录和当前草稿仍然保留。" : notice}
            </span>
            {ended && (
              <Button
                variant="outline"
                size="xs"
                disabled={resumeDisabled}
                onClick={actions.onResume}
              >
                {resuming ? "正在恢复…" : "继续接待"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div
        className="rounded-xl border border-border bg-card shadow-xs"
        style={{ "--input": "var(--card)" } as CSSProperties}
      >
        <InputGroup
          className="rounded-xl border-0 has-[[data-slot=input-group-control]:focus-visible]:ring-0"
          aria-label={`给 ${target} 的回复编辑器`}
        >
          <InputGroupTextarea
            ref={actions.inputRef}
            id={id}
            value={draftText}
            aria-label={`回复 ${target}`}
            aria-describedby={notice ? `${id}-notice` : undefined}
            placeholder={
              notice ? "可以保留草稿，恢复接待后发送" : `回复 ${name}…`
            }
            className={cn(
              "max-h-36 px-4 py-2",
              compact || notice ? "min-h-12" : "min-h-[77px]",
            )}
            onFocus={actions.onFocus}
            onChange={(event) => actions.onChangeText(event.target.value)}
            onCompositionStart={actions.onCompositionStart}
            onCompositionEnd={actions.onCompositionEnd}
            onKeyDown={actions.onKeyDown}
          />
          <InputGroupAddon
            align="block-start"
            className="flex-wrap justify-between gap-x-1 gap-y-1 px-2 pt-1.5 pb-0"
          >
            <ComposerTools
              conversationId={conversationId}
              compact={compact}
              onInsert={actions.onInsert}
            />
            <span
              title={`回复给 ${target}`}
              className="ml-auto flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] font-normal text-muted-foreground"
            >
              <span className="truncate">
                回复给{" "}
                <strong className="font-medium text-foreground">{name}</strong>
              </span>
              <SourceBadge identity={identity} />
            </span>
          </InputGroupAddon>
          <InputGroupAddon
            align="block-end"
            className="flex-col items-stretch gap-0 px-2 pt-0 pb-2"
          >
            {hasAttachments && (
              <div className="max-h-24 overflow-y-auto max-[760px]:max-h-16">
                <AttachmentDrafts conversationId={conversationId} />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              {onHistory ? (
                <InputGroupButton
                  size="xs"
                  className="h-8"
                  onClick={onHistory}
                  aria-label={`查看与 ${name} 的完整对话`}
                >
                  <History data-icon="inline-start" />
                  完整对话
                </InputGroupButton>
              ) : (
                <span className="pl-2 text-[10px] font-normal text-muted-foreground">
                  Enter 发送
                  <span className="max-[1360px]:hidden">
                    {" "}
                    · Shift + Enter 换行
                  </span>
                </span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <InputGroupButton
                  size="icon-sm"
                  title="发送并接待下一位 · Ctrl + Enter"
                  aria-label={`发送给 ${name} 并接待下一位`}
                  disabled={disabled}
                  onClick={() => actions.onSubmit(true)}
                >
                  <ArrowUpRight />
                </InputGroupButton>
                <Button
                  size="sm"
                  className="rounded-lg"
                  disabled={disabled}
                  title="Enter 发送，Shift + Enter 换行"
                  onClick={() => actions.onSubmit(false)}
                >
                  {busy ? "发送中" : "发送"}
                  <ArrowUp data-icon="inline-end" />
                </Button>
              </div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Field>
  );
}
