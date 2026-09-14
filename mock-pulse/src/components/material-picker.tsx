import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  PlusIcon,
  SearchIcon,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { CHANNELS, type ChannelId } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import { ChannelMark } from "./channel-mark";

export type PickerItem = {
  id: string;
  name: string;
  description: string;
  channel?: ChannelId;
  keywords?: string;
};

/** 原型中的搜索选择弹窗：每页 8 项，平台与素材数量不改变布局。 */
export function MaterialPicker({
  title,
  description,
  items,
  onSelect,
  onClose,
  platforms = false,
  filterByChannel = false,
}: {
  title: string;
  description: string;
  items: PickerItem[];
  onSelect: (id: string) => unknown | Promise<unknown>;
  onClose: () => void;
  platforms?: boolean;
  filterByChannel?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [channel, setChannel] = useState("all");
  const matches = items.filter(
    (item) =>
      (channel === "all" || item.channel === channel) &&
      `${item.name} ${item.description} ${item.keywords ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(matches.length / 8));
  const currentPage = Math.min(page, pages);
  const choose = async (id: string) => {
    if (pending) return;
    setPending(id);
    setError("");
    try {
      await onSelect(id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(null);
    }
  };
  return (
    <WorkspaceDialog
      open
      title={title}
      description={description}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <Button onClick={onClose} disabled={!!pending} variant="outline">
          取消
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchInput
            autoFocus
            value={query}
            onClear={
              query
                ? () => {
                    setQuery("");
                    setPage(1);
                  }
                : undefined
            }
            placeholder={platforms ? "搜索平台名称" : "搜索名称或类型"}
            aria-label="搜索可选素材"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {filterByChannel ? (
          <NativeSelect
            aria-label="筛选剧本平台"
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
          >
            <NativeSelectOption value="all">全部平台</NativeSelectOption>
            {CHANNELS.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <div className="my-4 flex flex-col gap-2">
        {matches.slice((currentPage - 1) * 8, currentPage * 8).map((item) => (
          <Button
            key={item.id}
            type="button"
            className="h-auto w-full justify-start gap-3 p-3 text-left whitespace-normal"
            disabled={!!pending}
            onClick={() => void choose(item.id)}
            variant="outline"
          >
            {item.channel ? (
              <ChannelMark channel={item.channel} />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {platforms ? (
                  <GlobeIcon aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <WorkflowIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="truncate">{item.name}</h3>
              <p className="mt-1 text-xs font-normal leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
            {pending === item.id ? (
              <Spinner data-icon="inline-end" />
            ) : (
              <PlusIcon aria-hidden="true" data-icon="inline-end" />
            )}
          </Button>
        ))}
      </div>
      {matches.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>没有可选择的素材</EmptyTitle>
            <EmptyDescription>
              换一个关键词，或先保存对应平台的素材。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>共 {matches.length} 项</span>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            <IconButton
              label="选择列表上一页"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </IconButton>
            <span>
              {currentPage} / {pages}
            </span>
            <IconButton
              label="选择列表下一页"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRightIcon aria-hidden="true" />
            </IconButton>
          </div>
        ) : null}
      </div>
      {error ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error}
        </Notice>
      ) : null}
    </WorkspaceDialog>
  );
}
