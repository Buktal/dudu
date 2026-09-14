import { CheckIcon, PencilIcon, StarIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { type ChannelId, channelById } from "@/lib/channels";
import { ChannelMark } from "./channel-mark";
import { IconButton } from "./icon-button";
import { WorkspaceDialog } from "./workspace-dialog";

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
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState(name);
  const [invalid, setInvalid] = useState(false);
  const rename = () => {
    if (!nextName.trim()) {
      setInvalid(true);
      return;
    }
    onNameChange?.(nextName.trim());
    setRenaming(false);
  };
  return (
    <>
      <header className="flex shrink-0 flex-col gap-4 bg-card px-5 py-5 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {channel ? <ChannelMark channel={channel} small /> : icon}
          {channel ? (
            <>
              <span>{channelById(channel)?.name}</span>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span>{kicker}</span>
          <div className="flex-1" />
          {revision ? <Badge variant="outline">v{revision}</Badge> : null}
          <span role="status" className="flex items-center gap-1.5">
            {dirty ? (
              <>
                <span className="size-1.5 rounded-full bg-primary" />
                未保存
              </>
            ) : saved ? (
              <>
                <CheckIcon className="size-3.5" />
                已保存
              </>
            ) : (
              "尚未保存"
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
            <h1 className="min-w-0 font-heading text-xl leading-snug font-semibold tracking-tight wrap-anywhere lg:text-2xl">
              {name || `未命名${label}`}
            </h1>
            {onNameChange ? (
              <IconButton
                label={`重命名${label}`}
                onClick={() => {
                  setNextName(name);
                  setInvalid(false);
                  setRenaming(true);
                }}
              >
                <PencilIcon />
              </IconButton>
            ) : null}
            {onFavorite ? (
              <Toggle
                size="sm"
                pressed={!!favorite}
                aria-label={favorite ? "取消收藏" : "收藏此素材"}
                onPressedChange={onFavorite}
              >
                <StarIcon fill={favorite ? "currentColor" : "none"} />
              </Toggle>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>
      <WorkspaceDialog
        open={renaming}
        title={`重命名${label}`}
        description="确认后更新草稿，保存素材时一起生效。"
        onClose={() => setRenaming(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              取消
            </Button>
            <Button onClick={rename}>确认名称</Button>
          </>
        }
      >
        <FieldGroup>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={nameId}>{label}名称</FieldLabel>
            <Input
              id={nameId}
              autoFocus
              maxLength={80}
              value={nextName}
              aria-invalid={invalid}
              onChange={(event) => {
                setNextName(event.target.value);
                setInvalid(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  rename();
                }
              }}
            />
            {invalid ? <FieldError>请填写{label}名称。</FieldError> : null}
          </Field>
        </FieldGroup>
      </WorkspaceDialog>
    </>
  );
}
