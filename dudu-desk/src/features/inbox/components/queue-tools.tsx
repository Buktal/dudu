import { ArrowDownWideNarrow, FilterX, Search, Star } from "lucide-react";
import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  queueOrders as orders,
  queueCountLabel,
  queueStatuses as statuses,
} from "../presentation";
import { loadConversations } from "../stores/queue";
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
      ...known
        .map((channel) => ({ value: channel.id, label: channel.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN-u-kn-true")),
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
        "shrink-0 gap-2 px-3 pb-2",
        compact &&
          "w-full flex-wrap px-0 pb-0 min-[761px]:w-auto min-[761px]:flex-row min-[761px]:items-center",
      )}
      aria-label="查找会话"
    >
      <Field
        className={cn(
          "min-w-0 gap-1",
          compact && "min-[761px]:w-64 min-[761px]:max-w-72",
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
                <FilterX />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <div
        className={cn(
          "grid min-w-0 grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-1.5",
          compact && "min-[761px]:w-[252px] min-[761px]:shrink-0",
        )}
      >
        <Field className="min-w-0">
          <FieldLabel className="sr-only" htmlFor={`${id}-status`}>
            按会话状态筛选
          </FieldLabel>
          <Select
            items={statuses}
            value={query.starred ? null : query.status}
            onValueChange={(value) => {
              const status = statuses.find((item) => item.value === value);
              if (status) change({ status: status.value, starred: false });
            }}
          >
            <SelectTrigger
              id={`${id}-status`}
              size="sm"
              className="w-full min-w-0 gap-1 rounded-lg px-1.5"
            >
              <SelectValue className="truncate text-xs" placeholder="全部" />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              className="w-48"
            >
              <SelectGroup>
                {statuses.map((status) => {
                  const count = counts?.[status.count];
                  return (
                    <SelectItem key={status.value} value={status.value}>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                        {status.label}
                        {count !== undefined && (
                          <span
                            className="shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                            title="全部来源"
                          >
                            {queueCountLabel(count)}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label={`会话排序，当前${orders.find((order) => order.value === query.order)?.label}`}
            title={`排序：${orders.find((order) => order.value === query.order)?.label}`}
          >
            <ArrowDownWideNarrow data-icon="inline-start" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>会话排序</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={query.order}
                onValueChange={(value) => {
                  if (value === "wait" || value === "messages")
                    change({ order: value });
                }}
              >
                {orders.map((order) => (
                  <DropdownMenuRadioItem key={order.value} value={order.value}>
                    {order.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </FieldGroup>
  );
}
