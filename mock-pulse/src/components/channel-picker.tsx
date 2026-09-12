import { CHANNELS, type ChannelId } from "@/lib/channels";
import { cn } from "@/lib/utils";

import { Badge } from "./ui/badge";

/**
 * 渠道选择器：CHANNELS 注册表驱动的选中态按钮组（渠道清单唯一来源 lib/channels）。
 * variant chips = 紧凑切换行（筛选 / 编辑器换渠道）；cards = 表单卡片（带协议与说明）。
 * allowAll 附「全部渠道」首项（列表筛选场景），此时值与回调含 "all"。
 */
type ChannelPickerProps =
  | {
      allowAll: true;
      value: ChannelId | "all";
      onSelect: (channel: ChannelId | "all") => void;
      variant?: "chips" | "cards";
    }
  | {
      allowAll?: false;
      value: ChannelId;
      onSelect: (channel: ChannelId) => void;
      variant?: "chips" | "cards";
    };

const chipClass = (selected: boolean) =>
  cn(
    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
    selected
      ? "bg-primary text-primary-foreground"
      : "bg-card text-muted-foreground hover:bg-accent",
  );

export function ChannelPicker(props: ChannelPickerProps) {
  const variant = props.variant ?? "chips";
  const allowAll = props.allowAll === true;
  // 调用方类型经判别联合收窄；内部统一以含 "all" 的宽松签名拼接（allowAll 关闭时不会发出 "all"）
  const value: ChannelId | "all" = props.value;
  const onSelect = props.onSelect as (channel: ChannelId | "all") => void;

  if (variant === "cards") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            aria-pressed={value === channel.id}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              value === channel.id
                ? "border-primary/40 bg-secondary text-secondary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {channel.name}
              </span>
              <Badge variant="outline" className="font-mono text-[9px]">
                {channel.protocol}
              </Badge>
            </span>
            <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
              {channel.note}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {allowAll ? (
        <button
          type="button"
          onClick={() => onSelect("all")}
          aria-pressed={value === "all"}
          className={chipClass(value === "all")}
        >
          全部渠道
        </button>
      ) : null}
      {CHANNELS.map((channel) => (
        <button
          key={channel.id}
          type="button"
          onClick={() => onSelect(channel.id)}
          aria-pressed={value === channel.id}
          className={chipClass(value === channel.id)}
        >
          {channel.name}
        </button>
      ))}
    </div>
  );
}
