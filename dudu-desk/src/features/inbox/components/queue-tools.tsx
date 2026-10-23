import {
  ArrowDownWideNarrow,
  FilterX,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useRef } from "react";
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
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emptyQuery, hasConversationFilters } from "../conversation-query";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import { SEARCH_MAX_LENGTH, useSearchDraft } from "../hooks/use-search-draft";
import {
  queueOrders as orders,
  queueCountLabel,
  queueStatuses as statuses,
} from "../presentation";
import { loadConversations } from "../stores/queue";
import type { ConversationQuery } from "../types";

export function QueueTools() {
  const dispatch = useInboxDispatch();
  const {
    query,
    counts,
    channels: catalog,
  } = useInboxSelector((state) => state.inbox.queue);
  const conversations = useInboxSelector((state) => state.inbox.conversations);
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
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
  const hasFilters = hasConversationFilters(query);

  function change(changes: Partial<ConversationQuery>) {
    void dispatch(loadConversations({ query: { ...query, ...changes } }));
  }

  // 搜索走「草稿-提交」：逐键只改草稿，防抖停顿或回车才提交查询
  const search = useSearchDraft(query.search, (keyword) =>
    change({ search: keyword }),
  );

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant={hasFilters ? "secondary" : "ghost"} size="icon-sm" />
        }
        className="relative shrink-0"
        data-inbox-filter-trigger
        data-filter-active={hasFilters || undefined}
        aria-label={hasFilters ? "查询条件（已筛选）" : "查询条件"}
        title="查询条件 · Ctrl + K"
      >
        <SlidersHorizontal data-icon="inline-start" />
        {hasFilters && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-24px)] rounded-xl"
        initialFocus={searchRef}
      >
        <PopoverTitle>查询条件</PopoverTitle>
        <FieldGroup className="gap-3" aria-label="查找会话">
          <Field className="min-w-0 gap-1">
            <FieldLabel className="sr-only" htmlFor={`${id}-search`}>
              搜索访客或消息
            </FieldLabel>
            <InputGroup className="rounded-lg">
              <InputGroupInput
                ref={searchRef}
                id={`${id}-search`}
                data-inbox-search
                type="search"
                placeholder="搜索访客或消息"
                value={search.draft}
                maxLength={SEARCH_MAX_LENGTH}
                onChange={(event) => search.onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    search.onEnter();
                  }
                }}
              />
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              {hasFilters && (
                <InputGroupAddon align="inline-end">
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
                </InputGroupAddon>
              )}
            </InputGroup>
          </Field>
          <div className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-1.5">
            <Field className="min-w-0">
              <FieldLabel className="sr-only" htmlFor={`${id}-status`}>
                按会话状态筛选
              </FieldLabel>
              <Select
                items={statuses}
                value={query.status}
                onValueChange={(value) => {
                  const status = statuses.find((item) => item.value === value);
                  if (status) change({ status: status.value });
                }}
              >
                <SelectTrigger
                  id={`${id}-status`}
                  size="sm"
                  className="w-full min-w-0 gap-1 rounded-lg px-1.5"
                >
                  <SelectValue
                    className="truncate text-xs"
                    placeholder="全部"
                  />
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
                      {channels.find(
                        (channel) => channel.value === query.channelId,
                      )?.label ?? "全部来源"}
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
                      <DropdownMenuRadioItem
                        key={order.value}
                        value={order.value}
                      >
                        {order.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
