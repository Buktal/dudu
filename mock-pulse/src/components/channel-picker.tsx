import { useState } from "react";
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { ChannelMark } from "./channel-mark";
import { MaterialPicker } from "./material-picker";
import { StudioIcon } from "./studio-icon";

type Props = { variant?: "chips" | "cards" } & (
  | {
      allowAll: true;
      value: ChannelId | "all";
      onSelect: (channel: ChannelId | "all") => void;
    }
  | {
      allowAll?: false;
      value: ChannelId;
      onSelect: (channel: ChannelId) => void;
    }
);

export function ChannelPicker(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="filter-platform"
        aria-label={props.allowAll ? "平台筛选" : "所属平台"}
        onClick={() => setOpen(true)}
      >
        {props.value === "all" ? (
          <StudioIcon name="globe" />
        ) : (
          <ChannelMark channel={props.value} small />
        )}
        <span>
          {props.value === "all" ? "全部平台" : channelById(props.value)?.name}
        </span>
        {props.value === "all" ? (
          <span className="muted">{CHANNELS.length}</span>
        ) : null}
        <StudioIcon name="chevron" />
      </button>
      {open ? (
        <MaterialPicker
          platforms
          title="选择平台"
          description="输入名称搜索平台。"
          items={[
            ...(props.allowAll
              ? [
                  {
                    id: "all",
                    name: "全部平台",
                    description: `${CHANNELS.length} 个平台`,
                  },
                ]
              : []),
            ...CHANNELS.map((channel) => ({
              id: channel.id,
              name: channel.name,
              description: channel.note,
              channel: channel.id,
            })),
          ]}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            if (id === "all") {
              if (props.allowAll) props.onSelect("all");
            } else {
              const channel = CHANNELS.find((item) => item.id === id);
              if (channel) props.onSelect(channel.id);
            }
          }}
        />
      ) : null}
    </>
  );
}
