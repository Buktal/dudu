import type { ComponentProps, ReactNode } from "react";
import { type ChannelId, channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ChannelMark } from "./channel-mark";
import { StudioIcon } from "./studio-icon";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

export function StudioButton({
  tone,
  small,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  tone?: "primary" | "soft" | "quiet" | "danger";
  small?: boolean;
}) {
  return (
    <Button
      variant="outline"
      className={cn("btn", tone, small && "small", className)}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn("icon-btn", className)}
      {...props}
    />
  );
}

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
  return (
    <header className="entity-head">
      <div className="entity-kicker">
        {channel ? (
          <>
            <span className="platform-inline">
              <ChannelMark channel={channel} small />
              {channelById(channel)?.name}
            </span>
            <span className="slash">/</span>
          </>
        ) : (
          icon
        )}
        <span>{kicker}</span>
        <span className="grow" />
        {onFavorite ? (
          <IconButton
            label={favorite ? "取消收藏" : "收藏此素材"}
            aria-pressed={favorite}
            onClick={onFavorite}
          >
            <StudioIcon
              name="star"
              className={cn("favorite-icon", favorite && "is-favorite")}
            />
          </IconButton>
        ) : null}
      </div>
      <div className="entity-title-row">
        <div className="entity-title">
          {onNameChange ? (
            <Input
              className="name-input"
              aria-label={`${label}名称`}
              value={name}
              maxLength={80}
              onChange={(event) => onNameChange(event.target.value)}
            />
          ) : (
            <h1 className="entity-name">{name}</h1>
          )}
          <div className="edit-status">
            {dirty ? (
              <>
                <span className="dot blue" /> 有未保存的修改
              </>
            ) : saved ? (
              <>{revision ? `v${revision} · ` : ""}已保存到素材库</>
            ) : (
              "尚未保存到素材库"
            )}
          </div>
        </div>
        <div className="actions">{actions}</div>
      </div>
    </header>
  );
}

export function StudioDialog({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn("mockpulse-studio studio-dialog", wide && "wide")}
      >
        <DialogHeader className="modal-header">
          <div className="grow">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <IconButton label="关闭弹窗" onClick={onClose}>
            <StudioIcon name="x" />
          </IconButton>
        </DialogHeader>
        <div className="modal-body">{children}</div>
        <footer className="modal-footer">
          {footer ?? (
            <StudioButton tone="primary" onClick={onClose}>
              完成
            </StudioButton>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
