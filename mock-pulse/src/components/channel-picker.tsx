import { GlobeIcon } from "lucide-react";
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { ChannelMark } from "./channel-mark";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
  const items = [
    ...(props.allowAll ? [{ value: "all", label: "全部平台" }] : []),
    ...CHANNELS.map((channel) => ({ value: channel.id, label: channel.name })),
  ];
  return (
    <Select
      items={items}
      value={props.value}
      onValueChange={(value) => {
        if (value === "all") {
          if (props.allowAll) props.onSelect("all");
        } else {
          const channel = CHANNELS.find((item) => item.id === value);
          if (channel) props.onSelect(channel.id);
        }
      }}
    >
      <SelectTrigger
        className="w-full"
        aria-label={props.allowAll ? "平台筛选" : "所属平台"}
      >
        {props.value === "all" ? (
          <GlobeIcon />
        ) : (
          <ChannelMark channel={props.value} small />
        )}
        <SelectValue>
          {props.value === "all" ? "全部平台" : channelById(props.value)?.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
