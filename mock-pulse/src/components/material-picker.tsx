import { useState } from "react";
import { CHANNELS, type ChannelId } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import { ChannelMark } from "./channel-mark";
import { IconButton, StudioButton, StudioDialog } from "./studio-controls";
import { StudioIcon } from "./studio-icon";
import { Input } from "./ui/input";

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
  const [pending, setPending] = useState(false);
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
    setPending(true);
    setError("");
    try {
      await onSelect(id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <StudioDialog
      open
      title={title}
      description={description}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <StudioButton onClick={onClose} disabled={pending}>
          取消
        </StudioButton>
      }
    >
      <div className="row">
        <div className="search grow">
          <StudioIcon name="search" />
          <Input
            autoFocus
            value={query}
            placeholder={platforms ? "搜索平台名称" : "搜索名称或类型"}
            aria-label="搜索可选素材"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {filterByChannel ? (
          <select
            aria-label="筛选剧本平台"
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部平台</option>
            {CHANNELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="modal-list">
        {matches.slice((currentPage - 1) * 8, currentPage * 8).map((item) => (
          <button
            key={item.id}
            type="button"
            className="modal-item"
            disabled={pending}
            onClick={() => void choose(item.id)}
          >
            {item.channel ? (
              <ChannelMark channel={item.channel} />
            ) : (
              <span className="platform-logo">
                <StudioIcon name={platforms ? "globe" : "plan"} />
              </span>
            )}
            <div className="grow">
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </div>
            <StudioIcon name="plus" />
          </button>
        ))}
      </div>
      {matches.length === 0 ? (
        <div className="empty">
          <StudioIcon name="search" />
          <h3>没有可选择的素材</h3>
          <p>换一个关键词，或先保存对应平台的素材。</p>
        </div>
      ) : null}
      <div className="modal-list-footer">
        <span>共 {matches.length} 项</span>
        <div className="pagination">
          <IconButton
            label="选择列表上一页"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <StudioIcon name="left" />
          </IconButton>
          <span>
            {currentPage} / {pages}
          </span>
          <IconButton
            label="选择列表下一页"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <StudioIcon name="right" />
          </IconButton>
        </div>
      </div>
      {error ? (
        <p role="alert" className="modal-inline-error">
          {error}
        </p>
      ) : null}
    </StudioDialog>
  );
}
