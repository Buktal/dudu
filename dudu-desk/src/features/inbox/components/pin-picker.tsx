import { Pin, Search, X } from "lucide-react";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { ApiFailure } from "@/lib/api-response";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  cancelConversationChoices,
  readConversationChoices,
} from "../stores/choices";
import { pinConversation } from "../stores/parallel";
import { failureOf } from "../stores/requests";
import { emptyQuery } from "../stores/state";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty, InboxError, InboxLoading } from "./inbox-state";

type ChoiceResult = {
  ids: string[];
  nextCursor: string | null;
  loading: boolean;
  error: ApiFailure | null;
};

const emptyResult: ChoiceResult = {
  ids: [],
  nextCursor: null,
  loading: true,
  error: null,
};

function PinChoices({
  inputRef,
  onSelected,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onSelected: () => void;
}) {
  const dispatch = useInboxDispatch();
  const primaryId = useInboxSelector((state) => state.inbox.activeId);
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const conversations = useInboxSelector((state) => state.inbox.conversations);
  const [query, setQuery] = useState<{ search: string; cursor?: string }>({
    search: "",
  });
  const [result, setResult] = useState<ChoiceResult>(emptyResult);
  const id = useId();
  const candidates = result.ids.flatMap((conversationId) => {
    const conversation = conversations[conversationId];
    return conversation &&
      conversation.id !== primaryId &&
      conversation.status !== "closed"
      ? [conversation]
      : [];
  });

  useEffect(() => {
    let active = true;
    setResult((previous) => ({ ...previous, loading: true, error: null }));
    void dispatch(
      readConversationChoices({
        query: {
          ...emptyQuery,
          status: "active",
          search: query.search,
          order: "wait",
        },
        cursor: query.cursor,
        scope: "pin-picker",
      }),
    )
      .then((page) => {
        if (!active) return;
        if (!page) {
          setResult((previous) => ({ ...previous, loading: false }));
          return;
        }
        setResult((previous) => ({
          ids: [
            ...new Set([
              ...(query.cursor ? previous.ids : []),
              ...page.items.map((conversation) => conversation.id),
            ]),
          ],
          nextCursor: page.nextCursor,
          loading: false,
          error: null,
        }));
      })
      .catch((error: unknown) => {
        if (active)
          setResult((previous) => ({
            ...previous,
            loading: false,
            error: failureOf(error),
          }));
      });
    return () => {
      active = false;
      dispatch(cancelConversationChoices("pin-picker"));
    };
  }, [dispatch, query]);

  function search(value: string) {
    setResult(emptyResult);
    setQuery({ search: value });
  }

  return (
    <>
      <FieldGroup className="shrink-0">
        <Field>
          <FieldLabel htmlFor={id} className="sr-only">
            搜索可固定的会话
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={id}
              ref={inputRef}
              type="search"
              value={query.search}
              placeholder="搜索未结束的会话…"
              onChange={(event) => search(event.target.value)}
            />
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            {query.search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="清除固定会话搜索"
                  onClick={() => search("")}
                >
                  <X data-icon="inline-start" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </Field>
      </FieldGroup>
      {!candidates.length && result.loading ? (
        <InboxLoading label="正在查找可固定的会话…" />
      ) : !candidates.length && result.error ? (
        <InboxError
          error={result.error}
          onRetry={() => setQuery({ ...query })}
        />
      ) : !candidates.length ? (
        <InboxEmpty
          title="没有可固定的会话"
          description="试试其他关键词，或继续加载尚未结束的会话。"
        />
      ) : (
        <Virtuoso
          className="min-h-0 flex-1"
          data={candidates}
          computeItemKey={(_, conversation) => conversation.id}
          itemContent={(_, conversation) => (
            <Button
              variant={conversation.id === pinnedId ? "secondary" : "ghost"}
              className="my-1 h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left whitespace-normal"
              aria-label={`固定 ${visitorName(conversation.identity)}，${conversation.identity.channelName}，${conversation.identity.accountName}`}
              onClick={() => {
                void dispatch(pinConversation(conversation.id));
                onSelected();
              }}
            >
              <VisitorAvatar identity={conversation.identity} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <strong className="truncate text-sm font-semibold">
                  {visitorName(conversation.identity)}
                </strong>
                <span className="flex min-w-0 items-center gap-2">
                  <SourceBadge identity={conversation.identity} />
                  <span className="truncate text-xs text-muted-foreground">
                    {conversation.identity.accountName}
                  </span>
                </span>
              </span>
              {conversation.id === pinnedId && <Pin data-icon="inline-end" />}
            </Button>
          )}
        />
      )}
      {result.error && candidates.length > 0 && (
        <InboxError
          error={result.error}
          compact
          onRetry={() => setQuery({ ...query })}
        />
      )}
      {result.nextCursor && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={result.loading}
          onClick={() => {
            if (result.nextCursor)
              setQuery({ ...query, cursor: result.nextCursor });
          }}
        >
          {result.loading ? "正在加载…" : "加载更多会话"}
        </Button>
      )}
    </>
  );
}

export function PinnedConversationPicker({
  open,
  onOpenChange,
  onPinned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPinned: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={input}
        showCloseButton={false}
        className="flex h-[min(650px,88dvh)] flex-col gap-4"
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>选择固定在右侧的会话</DialogTitle>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="关闭固定会话选择"
                />
              }
            >
              <X data-icon="inline-start" />
            </DialogClose>
          </div>
          <DialogDescription>
            选择另一位访客留在右窗，切换主接待时保持原位。
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PinChoices
            inputRef={input}
            onSelected={() => {
              onOpenChange(false);
              onPinned();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
