import { FilterX, Search, Star } from "lucide-react";
import { useId, useMemo } from "react";
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
import {
  queueOrders as orders,
  queueCountLabel,
  queueStatuses as statuses,
} from "../presentation";
import { loadConversations } from "../stores/reading";
import { emptyQuery } from "../stores/state";
import type { ConversationQuery } from "../types";

export function QueueTools({ compact = false }: { compact?: boolean }) {
  const dispatch = useInboxDispatch();
  const {
    query,
    counts,
    channels: catalog,
  } = useInboxSelector((state) => state.inbox.queue);
  const conversations = useInboxSelector((state) => state.inbox.conversations);
  const id = useId();
  const channels = useMemo(() => {
    const known =
      catalog ??
      Array.from(
        new Map(
          Object.values(conversations).map(({ identity }) => [
            identity.channelId,
            { id: identity.channelId, name: identity.channelName },
          ]),
        ).values(),
      );
    return [
      { value: "all", label: "全部来源" },
      ...known.map((channel) => ({ value: channel.id, label: channel.name })),
    ];
  }, [catalog, conversations]);
  const hasFilters =
    !!query.search ||
    query.channelId !== "all" ||
    query.status !== "active" ||
    query.starred;

  function change(changes: Partial<ConversationQuery>) {
    void dispatch(loadConversations({ query: { ...query, ...changes } }));
  }

  return (
    <FieldGroup
      className={cn(
        "shrink-0 gap-2.5 px-3 pb-2",
        compact &&
          "flex-wrap px-0 min-[1100px]:flex-row min-[1100px]:items-center",
      )}
      aria-label="查找会话"
    >
      <ToggleGroup
        value={query.starred ? [] : [query.status]}
        onValueChange={(values) => {
          const status = statuses.find((item) => item.value === values[0]);
          if (status) change({ status: status.value, starred: false });
        }}
        size="sm"
        spacing={1.5}
        className={cn(
          "grid w-full grid-cols-2",
          compact &&
            "min-[761px]:grid-cols-4 min-[1100px]:w-auto min-[1100px]:shrink-0",
        )}
        aria-label="按会话状态筛选"
      >
        {statuses.map((status) => {
          const count = counts?.[status.count];
          const label =
            count === undefined
              ? status.label
              : `${status.label}，${count.toLocaleString("zh-CN")} 个会话`;
          return (
            <ToggleGroupItem
              key={status.value}
              value={status.value}
              aria-label={label}
              title={count === undefined ? label : `${label}（全部来源）`}
              className={cn(
                "min-w-0 justify-between gap-2 rounded-lg px-2.5",
                compact && "min-[1100px]:min-w-[92px]",
              )}
            >
              <span className="shrink-0 text-xs">{status.label}</span>
              {count !== undefined && (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                >
                  {queueCountLabel(count)}
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <Field
        className={cn(
          "min-w-0 gap-1",
          compact &&
            "min-[1100px]:w-auto min-[1100px]:min-w-44 min-[1100px]:flex-1",
        )}
      >
        <FieldLabel className="sr-only" htmlFor={`${id}-search`}>
          搜索访客或消息
        </FieldLabel>
        <InputGroup className="rounded-lg">
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
            <Toggle
              size="sm"
              pressed={query.starred}
              onPressedChange={(starred) =>
                change({ starred, status: starred ? "all" : "active" })
              }
              aria-label="仅查看星标会话"
              title="星标会话（包含已结束）"
              className="size-6 min-w-6 shrink-0 rounded-md p-0"
            >
              <Star
                data-icon="inline-start"
                className={cn(query.starred && "fill-current")}
              />
            </Toggle>
            {hasFilters && (
              <InputGroupButton
                size="icon-xs"
                aria-label="清除筛选"
                title="清除筛选"
                onClick={() =>
                  void dispatch(
                    loadConversations({
                      query: { ...emptyQuery, order: query.order },
                    }),
                  )
                }
              >
                <FilterX data-icon="inline-start" />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          compact && "min-[1100px]:w-[236px] min-[1100px]:shrink-0",
        )}
      >
        <Field className="min-w-0 flex-1">
          <FieldLabel className="sr-only" htmlFor={`${id}-channel`}>
            按消息来源筛选
          </FieldLabel>
          <Select
            items={channels}
            value={query.channelId}
            onValueChange={(value) => change({ channelId: value ?? "all" })}
          >
            <SelectTrigger
              id={`${id}-channel`}
              size="sm"
              className="w-full min-w-0 gap-1 rounded-lg px-1.5"
            >
              <SelectValue>
                <span className="truncate text-xs">
                  {channels.find((channel) => channel.value === query.channelId)
                    ?.label ?? "全部来源"}
                </span>
              </SelectValue>
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
        <Field className="min-w-0 flex-1">
          <FieldLabel className="sr-only" htmlFor={`${id}-order`}>
            会话排序
          </FieldLabel>
          <Select
            items={orders}
            value={query.order}
            onValueChange={(value) => {
              if (value === "wait" || value === "messages")
                change({ order: value });
            }}
          >
            <SelectTrigger
              id={`${id}-order`}
              size="sm"
              className="w-full min-w-0 gap-1 rounded-lg px-1.5"
            >
              <SelectValue>
                <span className="text-xs">
                  {orders.find((order) => order.value === query.order)?.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {orders.map((order) => (
                  <SelectItem key={order.value} value={order.value}>
                    {order.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FieldGroup>
  );
}
