import { StarIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { type ChannelId, channelById } from "@/lib/channels";
import { ChannelMark } from "./channel-mark";

export function EntityHeader({
  name,
  onNameChange,
  label,
  channel,
  kicker,
  icon,
  dirty,
  saved,
  revision,
  favorite,
  onFavorite,
  actions,
}: {
  name: string;
  onNameChange?: (name: string) => void;
  label: string;
  channel?: ChannelId;
  kicker: string;
  icon?: ReactNode;
  dirty?: boolean;
  saved?: boolean;
  revision?: number;
  favorite?: boolean;
  onFavorite?: () => void;
  actions?: ReactNode;
}) {
  const nameId = useId();
  return (
    <header className="flex shrink-0 flex-col gap-3 p-4 lg:p-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {channel ? (
          <>
            <ChannelMark channel={channel} small />
            <span>{channelById(channel)?.name}</span>
            <span aria-hidden>/</span>
          </>
        ) : (
          icon
        )}
        <span>{kicker}</span>
        {onFavorite ? (
          <Toggle
            size="sm"
            pressed={!!favorite}
            aria-label={favorite ? "取消收藏" : "收藏此素材"}
            onPressedChange={onFavorite}
            className="ml-auto"
          >
            <StarIcon fill={favorite ? "currentColor" : "none"} />
          </Toggle>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-2">
          {onNameChange ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={nameId}>{label}名称</FieldLabel>
                <Input
                  id={nameId}
                  aria-label={`${label}名称`}
                  value={name}
                  maxLength={80}
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </Field>
            </FieldGroup>
          ) : (
            <h1 className="font-heading text-xl font-semibold">{name}</h1>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {dirty ? (
              <>
                <span className="size-1.5 rounded-full bg-primary" />
                有未保存的修改
              </>
            ) : saved ? (
              <>{revision ? `v${revision} · ` : ""}已保存到素材库</>
            ) : (
              "尚未保存到素材库"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
