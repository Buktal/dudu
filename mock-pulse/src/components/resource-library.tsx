import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { type ListProps, Virtuoso } from "react-virtuoso";
import { IconButton } from "@/components/icon-button";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ChannelMark } from "./channel-mark";

export type ResourceEntry = {
  id: string;
  name: string;
  description: string;
  channel?: ChannelId;
  icon?: ReactNode;
  favorite?: boolean;
};

const ResourceList = forwardRef<HTMLDivElement, ListProps>((props, ref) => (
  <div {...props} ref={ref} className="flex flex-col gap-1 px-2 pb-3" />
));

export function ResourceFilters<T extends string>({
  value,
  options,
  onChange,
  label = "素材类型筛选",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <ToggleGroup
      className="w-full"
      size="sm"
      value={[value]}
      aria-label={label}
      onValueChange={(values) => {
        if (values[0]) onChange(values[0] as T);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="min-w-0 flex-1"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function ResourceLibrary({
  title,
  singular,
  total,
  query,
  onQuery,
  onCreate,
  filters,
  entries,
  selectedId,
  onSelect,
  page,
  pages,
  filteredTotal,
  onPage,
  onClear,
  onContextMenu,
  error,
}: {
  title: string;
  singular: string;
  total: number;
  query: string;
  onQuery: (query: string) => void;
  onCreate?: () => void;
  filters?: ReactNode;
  entries: ResourceEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  pages: number;
  filteredTotal: number;
  onPage: (page: number) => void;
  onClear?: () => void;
  onContextMenu?: (id: string) => void;
  error?: string;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          <Badge variant="outline">{total}</Badge>
        </div>
        {onCreate ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`新建${singular}`}
            onClick={onCreate}
          >
            <PlusIcon data-icon="inline-start" />
            新建
          </Button>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-3 px-3 pb-4">
        <SearchInput
          aria-label={`搜索${singular}`}
          placeholder={`搜索${singular}…`}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onClear={query ? () => onQuery("") : undefined}
        />
        {filters}
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <Empty role="alert">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InfoIcon />
              </EmptyMedia>
              <EmptyTitle>读取失败</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : entries.length ? (
          <Virtuoso
            components={{ List: ResourceList }}
            style={{ height: "100%" }}
            data={entries}
            computeItemKey={(_index, item) => item.id}
            itemContent={(_index, item) => (
              <div className="group/resource relative">
                <Button
                  variant={selectedId === item.id ? "secondary" : "ghost"}
                  className={cn(
                    "h-auto w-full min-w-0 justify-start gap-3 p-3 text-left",
                    onContextMenu && "pr-10",
                  )}
                  aria-current={selectedId === item.id ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  {item.channel ? (
                    <ChannelMark channel={item.channel} />
                  ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {item.icon ?? <WorkflowIcon />}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{item.name}</span>
                      {item.favorite ? (
                        <StarIcon aria-label="已收藏" fill="currentColor" />
                      ) : null}
                    </span>
                    <span
                      className="truncate text-xs font-normal text-muted-foreground"
                      title={item.description}
                    >
                      {item.description}
                    </span>
                  </span>
                </Button>
                {onContextMenu ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="absolute top-3 right-1.5 sm:opacity-0 sm:group-focus-within/resource:opacity-100 sm:group-hover/resource:opacity-100 data-[popup-open]:opacity-100"
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`更多操作：${item.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onContextMenu(item.id)}
                        >
                          <Trash2Icon />
                          删除{singular}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            )}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {total ? <SearchIcon /> : <FolderOpenIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {total
                  ? "没有找到匹配项"
                  : `还没有${singular === "运行" ? "运行记录" : singular}`}
              </EmptyTitle>
              <EmptyDescription>
                {total
                  ? "试试其他关键词，或清除筛选。"
                  : singular === "运行"
                    ? "完成一次发送后，请求和回执会保存在这里。"
                    : `新建第一份${singular}，保存后就能反复使用。`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {!total && onCreate ? (
                <Button size="sm" variant="outline" onClick={onCreate}>
                  新建{singular}
                </Button>
              ) : onClear && total > 0 ? (
                <Button size="sm" variant="outline" onClick={onClear}>
                  清除筛选
                </Button>
              ) : null}
            </EmptyContent>
          </Empty>
        )}
      </div>
      <footer className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          {filteredTotal === total
            ? `共 ${total} 项`
            : `${filteredTotal} 项结果 · 共 ${total} 项`}
        </span>
        {pages > 1 ? (
          <div className="flex items-center gap-1">
            <IconButton
              label="上一页"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeftIcon />
            </IconButton>
            <span className="font-mono tabular-nums">
              {page} / {pages}
            </span>
            <IconButton
              label="下一页"
              disabled={page >= pages}
              onClick={() => onPage(page + 1)}
            >
              <ChevronRightIcon />
            </IconButton>
          </div>
        ) : (
          <span>本机</span>
        )}
      </footer>
    </>
  );
}
