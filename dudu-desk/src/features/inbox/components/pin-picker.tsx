import { Pin, Search, X } from "lucide-react";
import { type RefObject, useEffect, useId, useRef } from "react";
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
import {
  useFollowOutput,
  virtuosoBehaviorProps,
} from "../hooks/use-follow-output";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  cancelConversationChoices,
  pinPickerChoicesScope,
  readConversationChoices,
  retryConversationChoices,
  selectPinnableChoices,
} from "../stores/choices";
import { pinConversation } from "../stores/parallel";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxListPhase } from "./inbox-state";

function PinChoices({
  inputRef,
  onSelected,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onSelected: () => void;
}) {
  const dispatch = useInboxDispatch();
  const pinnedId = useInboxSelector((state) => state.inbox.pinnedId);
  const { search, loading, error, nextCursor, candidates } = useInboxSelector(
    selectPinnableChoices,
  );
  const id = useId();
  const { followOutput, setAtTop, setAtBottom } = useFollowOutput();

  useEffect(() => {
    void dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
      }),
    );
    return () => dispatch(cancelConversationChoices(pinPickerChoicesScope));
  }, [dispatch]);

  function change(value: string) {
    void dispatch(
      readConversationChoices({
        view: "pinnable",
        scope: pinPickerChoicesScope,
        search: value,
      }),
    );
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
              value={search}
              placeholder="搜索未结束的会话…"
              onChange={(event) => change(event.target.value)}
            />
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="清除固定会话搜索"
                  onClick={() => change("")}
                >
                  <X data-icon="inline-start" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </Field>
      </FieldGroup>
      <InboxListPhase
        loading={loading}
        count={candidates.length}
        error={error}
        onRetry={() =>
          void dispatch(retryConversationChoices(pinPickerChoicesScope))
        }
        loadingLabel="正在查找可固定的会话…"
        empty={{
          title: "没有可固定的会话",
          description: "试试其他关键词，或继续加载尚未结束的会话。",
        }}
      >
        <Virtuoso
          className="min-h-0 flex-1"
          {...virtuosoBehaviorProps}
          // 默认情况下，followOutput 只会在列表已经到底部时向下滚动
          followOutput={followOutput}
          // 当列表滚动到顶部或向下滚动时，会调用此回调并传入 true / false
          atTopStateChange={setAtTop}
          // 当列表滚动到底部或向上滚动时，会调用此回调并传入 true / false
          atBottomStateChange={setAtBottom}
          // 要渲染的数据数组。设置这个后，会根据数组长度推断总数量
          data={candidates}
          // 自定义列表每项的 key（React key），提升性能，避免重复渲染
          computeItemKey={(_, conversation) => conversation.id}
          // 渲染每个项目的回调函数。返回要显示的 React 元素
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
          // 设置默认项目高度，避免首次渲染探测。会话行高一致，按实际行高取 72。
          defaultItemHeight={72}
        />
      </InboxListPhase>
      {nextCursor && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={loading}
          onClick={() => {
            if (nextCursor)
              void dispatch(
                readConversationChoices({
                  view: "pinnable",
                  scope: pinPickerChoicesScope,
                  cursor: nextCursor,
                }),
              );
          }}
        >
          {loading ? "正在加载…" : "加载更多会话"}
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
