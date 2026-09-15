import { Search, Star, X } from "lucide-react";
import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { loadConversations } from "../stores/reading";
import { emptyQuery } from "../stores/state";
import type { ConversationQuery } from "../types";

const statuses = [
  { value: "all", label: "全部" },
  { value: "needs-reply", label: "待回复" },
  { value: "waiting", label: "等待中" },
  { value: "closed", label: "已结束" },
] as const;

export function QueueTools({ compact = false }: { compact?: boolean }) {
  const dispatch = useInboxDispatch();
  const query = useInboxSelector((state) => state.inbox.queue.query);
  const conversations = useInboxSelector((state) => state.inbox.conversations);
  const id = useId();
  const channels = useMemo(() => {
    const known = new Map(
      Object.values(conversations).map(({ identity }) => [
        identity.channelId,
        identity.channelName,
      ]),
    );
    return [
      { value: "all", label: "全部渠道" },
      ...Array.from(known, ([value, label]) => ({ value, label })),
    ];
  }, [conversations]);
  const hasFilters =
    !!query.search ||
    query.channelId !== "all" ||
    query.status !== "all" ||
    query.starred;

  function change(changes: Partial<ConversationQuery>) {
    void dispatch(loadConversations({ query: { ...query, ...changes } }));
  }

  return (
    <FieldGroup
      className={cn(
        "gap-3 px-3 pb-3",
        compact &&
          "min-[1100px]:grid min-[1100px]:grid-cols-[minmax(160px,1fr)_auto_minmax(280px,1fr)] min-[1100px]:items-center",
      )}
      aria-label="查找会话"
    >
      <Field className="gap-1">
        <FieldLabel className="sr-only" htmlFor={`${id}-search`}>
          搜索访客或消息
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`${id}-search`}
            data-inbox-search
            type="search"
            placeholder="搜索访客或消息"
            value={query.search}
            onChange={(event) => change({ search: event.target.value })}
          />
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {query.search ? (
              <InputGroupButton
                size="icon-xs"
                aria-label="清除搜索"
                onClick={() => change({ search: "" })}
              >
                <X data-icon="inline-start" />
              </InputGroupButton>
            ) : (
              <kbd className="text-[10px] text-muted-foreground">Ctrl K</kbd>
            )}
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <ToggleGroup
        value={[query.status]}
        onValueChange={(values) => {
          const status = statuses.find((item) => item.value === values[0]);
          if (status) change({ status: status.value });
        }}
        size="sm"
        spacing={1}
        className="w-full"
        aria-label="按会话状态筛选"
      >
        {statuses.map((status) => (
          <ToggleGroupItem
            key={status.value}
            value={status.value}
            className="min-w-0 flex-1 px-2 text-xs"
          >
            {status.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex min-w-0 items-center gap-1">
        <Field className="min-w-0 flex-1">
          <FieldLabel className="sr-only" htmlFor={`${id}-channel`}>
            按渠道筛选
          </FieldLabel>
          <Select
            items={channels}
            value={query.channelId}
            onValueChange={(value) => change({ channelId: value ?? "all" })}
          >
            <SelectTrigger
              id={`${id}-channel`}
              size="sm"
              className="w-full text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {channels.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Toggle
          size="sm"
          pressed={query.starred}
          onPressedChange={(starred) => change({ starred })}
          aria-label="仅查看星标会话"
          className="text-xs"
        >
          <Star data-icon="inline-start" />
          星标
        </Toggle>
        <Button
          variant="ghost"
          size="xs"
          disabled={!hasFilters}
          onClick={() =>
            void dispatch(loadConversations({ query: { ...emptyQuery } }))
          }
        >
          清除筛选
        </Button>
      </div>
    </FieldGroup>
  );
}
