import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AudioLines,
  Download,
  ExternalLink,
  FileText,
  Film,
  ImageIcon,
  MapPin,
  Package,
  Quote,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  formatFileSize,
  safeAssetUrl,
  safeExternalUrl,
} from "@/lib/attachment-utils";
import type { MessageBody as Body, MediaReference } from "../types";

const mediaLabels = {
  image: "图片",
  audio: "音频",
  video: "视频",
  file: "文件",
};
const mediaIcons = {
  image: ImageIcon,
  audio: AudioLines,
  video: Film,
  file: FileText,
};

export function MessageBody({ body }: { body: Body }) {
  if (body.type === "text")
    return <p className="whitespace-pre-wrap break-words">{body.text}</p>;
  if (body.type === "reply")
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {body.text && (
          <p className="whitespace-pre-wrap break-words">{body.text}</p>
        )}
        {body.attachments.map((media) => (
          <MessageMedia key={`${media.id}:${media.url}`} media={media} />
        ))}
      </div>
    );
  if ("media" in body)
    return (
      <MessageMedia
        key={`${body.media.id}:${body.media.url}`}
        media={body.media}
      />
    );
  if (body.type === "link")
    return (
      <div className="flex min-w-0 flex-col items-start gap-2">
        <p className="font-medium break-words">{body.title || "链接"}</p>
        {body.description && (
          <p className="whitespace-pre-wrap break-words text-xs opacity-80">
            {body.description}
          </p>
        )}
        <p className="break-all text-xs opacity-80">{body.url}</p>
        <ExternalAction url={safeExternalUrl(body.url)} label="打开链接" />
      </div>
    );
  if (body.type === "location") {
    const hasCoordinates =
      Number.isFinite(body.latitude) &&
      Number.isFinite(body.longitude) &&
      Math.abs(body.latitude) <= 90 &&
      Math.abs(body.longitude) <= 180;
    return (
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="break-words">{body.label || "位置"}</p>
          <p className="break-all text-xs opacity-80">
            {hasCoordinates
              ? `${body.latitude}, ${body.longitude}`
              : "渠道未提供有效坐标"}
          </p>
        </div>
      </div>
    );
  }
  if (body.type === "quote")
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <blockquote className="flex gap-1.5 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" />
          <p className="whitespace-pre-wrap break-words">
            {body.quotedText || "原消息未提供"}
          </p>
        </blockquote>
        <p className="whitespace-pre-wrap break-words">{body.text}</p>
      </div>
    );
  if (body.type === "card")
    return (
      <div className="flex items-start gap-2">
        <Package className="mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="font-medium break-words">{body.title || body.kind}</p>
          {body.title && <p className="text-xs opacity-70">{body.kind}</p>}
          {body.externalId && (
            <p className="break-all text-xs">编号：{body.externalId}</p>
          )}
          <ExternalAction url={safeExternalUrl(body.url)} label="查看来源" />
        </div>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p className="break-words">暂不支持的消息 · {body.originalType}</p>
      <p className="whitespace-pre-wrap break-words text-xs opacity-70">
        {body.explanation || "已保留这条来信，详情暂不可读。"}
      </p>
      <ExternalAction url={safeExternalUrl(body.sourceUrl)} label="查看来源" />
    </div>
  );
}

function MessageMedia({ media }: { media: MediaReference }) {
  const [failed, setFailed] = useState(false);
  const source =
    !failed && media.kind !== "file"
      ? safeAssetUrl(media.url, media.kind)
      : null;
  if (!source)
    return (
      <MediaFile media={media} unavailable={failed || media.kind !== "file"} />
    );
  if (media.kind === "image")
    return (
      <MessageImage
        media={media}
        source={source}
        onError={() => setFailed(true)}
      />
    );
  return (
    <div className="flex w-72 max-w-full min-w-0 flex-col gap-2">
      {media.kind === "audio" ? (
        // biome-ignore lint/a11y/useMediaCaption: The channel contract has no transcript or caption asset; do not fabricate one.
        <audio
          controls
          preload="metadata"
          src={source}
          className="w-full min-w-0"
          aria-label={media.name}
          onError={() => setFailed(true)}
        />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: The channel contract has no transcript or caption asset; do not fabricate one.
        <video
          controls
          playsInline
          preload="metadata"
          src={source}
          className="max-h-64 w-full rounded-xl bg-muted"
          aria-label={media.name}
          onError={() => setFailed(true)}
        />
      )}
      <p className="break-words text-xs opacity-70">
        {media.name} · {formatFileSize(media.size)}
      </p>
    </div>
  );
}

function MessageImage({
  media,
  source,
  onError,
}: {
  media: MediaReference;
  source: string;
  onError: () => void;
}) {
  const download = safeAssetUrl(media.url, "download");
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto max-w-full overflow-hidden rounded-xl p-0"
          />
        }
        aria-label={`放大图片：${media.name}`}
      >
        <img
          src={source}
          alt={media.name}
          loading="lazy"
          className="max-h-60 max-w-full rounded-xl object-contain"
          onError={onError}
        />
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="break-words">{media.name}</DialogTitle>
          <DialogDescription>{formatFileSize(media.size)}</DialogDescription>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
            />
          }
          aria-label="关闭图片预览"
        >
          <X />
        </DialogClose>
        <img
          src={source}
          alt={media.name}
          className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain"
          onError={onError}
        />
        <ExternalAction
          url={download}
          label={download?.startsWith("data:") ? "下载原图" : "打开原图"}
          downloadName={download?.startsWith("data:") ? media.name : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}

function MediaFile({
  media,
  unavailable,
}: {
  media: MediaReference;
  unavailable: boolean;
}) {
  const Icon = mediaIcons[media.kind];
  const source = !unavailable ? safeAssetUrl(media.url, "download") : null;
  return (
    <Attachment className="w-full max-w-72" size="sm">
      <AttachmentMedia>
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={media.name}>{media.name}</AttachmentTitle>
        <AttachmentDescription>
          {mediaLabels[media.kind]} · {formatFileSize(media.size)}
        </AttachmentDescription>
        {!source && (
          <p className="mt-1 text-xs text-muted-foreground">素材暂不可读取</p>
        )}
        <ExternalAction
          url={source}
          label={source?.startsWith("data:") ? "下载附件" : "打开附件"}
          downloadName={source?.startsWith("data:") ? media.name : undefined}
        />
      </AttachmentContent>
    </Attachment>
  );
}

function ExternalAction({
  url,
  label,
  downloadName,
}: {
  url: string | null;
  label: string;
  downloadName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url) return null;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <Button
        variant="ghost"
        size="xs"
        nativeButton={false}
        render={
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={downloadName}
          />
        }
        onClick={(event) => {
          setFailed(false);
          if (isTauri() && safeExternalUrl(url)) {
            event.preventDefault();
            void openUrl(url).catch(() => setFailed(true));
          }
        }}
      >
        {downloadName ? <Download /> : <ExternalLink />}
        {label}
      </Button>
      {failed && (
        <span role="status" className="text-xs text-destructive">
          暂时无法打开，请稍后重试
        </span>
      )}
    </span>
  );
}
