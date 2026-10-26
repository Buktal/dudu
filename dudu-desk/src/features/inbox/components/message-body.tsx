import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Download,
  ExternalLink,
  MapPin,
  Package,
  Quote,
  X,
} from "lucide-react";
import { useState } from "react";
import { InlineActionError } from "@/components/inline-action-error";
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
import { useInboxDispatch } from "../hooks/use-inbox-store";
import { useMessageMedia } from "../hooks/use-message-media";
import {
  assetPurposeOf,
  describeMessageBody,
  mediaIcon,
  mediaLabel,
  mediaName,
} from "../message-content";
import { loadMessageMedia } from "../stores/media";
import type { MessageBody as Body, MediaReference } from "../types";

export function MessageBody({
  body,
  messageId,
}: {
  body: Body;
  /** 所属消息 ID：向媒体接口读取需要渠道凭据的素材时用于定位。 */
  messageId: string;
}) {
  const descriptor = describeMessageBody(body);
  if (body.type === "text")
    return <p className="whitespace-pre-wrap break-words">{body.text}</p>;
  if (body.type === "reply")
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {body.text && (
          <p className="whitespace-pre-wrap break-words">{body.text}</p>
        )}
        {/* 契约第 4 节：reply 的媒体下标就是 attachments 数组下标 */}
        {descriptor.media.map((media, index) => (
          <MessageMedia
            key={`${media.id}:${media.url ?? ""}`}
            media={media}
            messageId={messageId}
            index={index}
          />
        ))}
      </div>
    );
  // 纯收窄守卫（无分派知识）：数据以 descriptor 为准，
  // message-content 保证媒体承载体对应恰好一项。
  if ("media" in body)
    return (
      <MessageMedia
        key={`${descriptor.media[0].id}:${descriptor.media[0].url ?? ""}`}
        media={descriptor.media[0]}
        messageId={messageId}
        index={0}
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
        <ExternalAction url={descriptor.externalUrl} label="打开链接" />
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
          <ExternalAction url={descriptor.externalUrl} label="查看来源" />
        </div>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <p className="break-words">暂不支持的消息 · {body.originalType}</p>
      <p className="whitespace-pre-wrap break-words text-xs opacity-70">
        {body.explanation || "已保留这条来信，详情暂不可读。"}
      </p>
      <ExternalAction url={descriptor.externalUrl} label="查看来源" />
    </div>
  );
}

function MessageMedia({
  media,
  messageId,
  index,
}: {
  media: MediaReference;
  messageId: string;
  index: number;
}) {
  const dispatch = useInboxDispatch();
  const [failed, setFailed] = useState(false);
  const purpose = assetPurposeOf(media.kind);
  // 公开链接直连渠道；只有渠道标识的素材经认证的媒体接口取字节
  const direct = safeAssetUrl(media.url, purpose);
  const fetched = useMessageMedia(messageId, index, direct === null && !failed);
  const source = failed ? null : (direct ?? fetched.url);
  if (!source)
    return (
      <MediaFile
        media={media}
        source={null}
        pending={fetched.status === "loading"}
        onRetry={
          fetched.status === "error"
            ? () => void dispatch(loadMessageMedia(messageId, index))
            : undefined
        }
      />
    );
  if (purpose === "image")
    return (
      <MessageImage
        media={media}
        source={source}
        onError={() => setFailed(true)}
      />
    );
  if (purpose === "download")
    return <MediaFile media={media} source={source} pending={false} />;
  return (
    <div className="flex w-72 max-w-full min-w-0 flex-col gap-2">
      {purpose === "audio" ? (
        // biome-ignore lint/a11y/useMediaCaption: The channel contract has no transcript or caption asset; do not fabricate one.
        <audio
          controls
          preload="metadata"
          src={source}
          className="w-full min-w-0"
          aria-label={mediaName(media)}
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
          aria-label={mediaName(media)}
          onError={() => setFailed(true)}
        />
      )}
      <p className="break-words text-xs opacity-70">
        {mediaName(media)} · {formatFileSize(media.size)}
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
  const download = safeAssetUrl(media.url, "download") ?? source;
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto max-w-full overflow-hidden rounded-xl p-0"
          />
        }
        aria-label={`放大图片：${mediaName(media)}`}
      >
        <img
          src={source}
          alt={mediaName(media)}
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
          <DialogTitle className="break-words">{mediaName(media)}</DialogTitle>
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
          alt={mediaName(media)}
          className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain"
          onError={onError}
        />
        <ExternalAction
          url={download}
          label={isLocalAsset(download) ? "下载原图" : "打开原图"}
          downloadName={isLocalAsset(download) ? media.name : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}

function MediaFile({
  media,
  source,
  pending,
  onRetry,
}: {
  media: MediaReference;
  /** 已解析的素材地址：公开链接或接口取回的本地对象 URL，未就绪为 null。 */
  source: string | null;
  pending: boolean;
  /** 读取失败时的重试入口；公开链接加载失败的素材没有本地重试路径，不提供。 */
  onRetry?: () => void;
}) {
  const Icon = mediaIcon(media.kind);
  return (
    <Attachment className="w-full max-w-72" size="sm">
      <AttachmentMedia>
        <Icon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={mediaName(media)}>
          {mediaName(media)}
        </AttachmentTitle>
        <AttachmentDescription>
          {mediaLabel(media.kind)} · {formatFileSize(media.size)}
        </AttachmentDescription>
        {pending ? (
          <p className="mt-1 text-xs text-muted-foreground">正在读取素材…</p>
        ) : !source && onRetry ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            素材暂不可读取
            <Button variant="ghost" size="xs" onClick={onRetry}>
              重试
            </Button>
          </p>
        ) : (
          !source && (
            <p className="mt-1 text-xs text-muted-foreground">素材暂不可读取</p>
          )
        )}
        <ExternalAction
          url={source}
          label={isLocalAsset(source) ? "下载附件" : "打开附件"}
          downloadName={isLocalAsset(source) ? media.name : undefined}
        />
      </AttachmentContent>
    </Attachment>
  );
}

// data:/blob: 是本地素材地址：直接下载而不是交给外部打开
function isLocalAsset(source: string | null | undefined): boolean {
  return (
    source !== null &&
    source !== undefined &&
    (source.startsWith("data:") || source.startsWith("blob:"))
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
      <InlineActionError message={failed ? "暂时无法打开，请稍后重试" : null} />
    </span>
  );
}
