import {
  Check,
  FilePenLine,
  Info,
  LoaderCircle,
  PanelRightClose,
  RefreshCw,
  Star,
  Tag,
} from "lucide-react";
import { useEffect, useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  discardProfileEdits,
  editVisitorProfile,
  saveVisitorProfile,
  setConversationStarred,
} from "../stores/details";
import { loadProfile } from "../stores/reading";
import type { ProfileField } from "../types";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty, InboxError } from "./inbox-state";

function ProfileValue({ field }: { field: ProfileField }) {
  if (field.state === "available") return <span>{field.value}</span>;
  return (
    <span className="text-muted-foreground">
      {field.state === "not-provided" ? "渠道未提供" : "内容为空"}
    </span>
  );
}

export function VisitorInfo({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose?: () => void;
}) {
  const dispatch = useInboxDispatch();
  const conversation = useInboxSelector(
    (state) => state.inbox.conversations[conversationId],
  );
  const loaded = useInboxSelector(
    (state) => state.inbox.profiles[conversationId],
  );
  const edit = useInboxSelector(
    (state) => state.inbox.profileEdits[conversationId],
  );
  const star = useInboxSelector(
    (state) => state.inbox.starUpdates[conversationId],
  );
  const id = useId();
  const profile = loaded?.data;
  const dirty = !!edit && edit.revision !== edit.savedRevision;
  const saving = edit?.status === "saving";
  const showEdit = dirty || saving;

  useEffect(() => {
    if (conversation && (!loaded || loaded.status === "idle"))
      void dispatch(loadProfile(conversationId));
  }, [conversation, conversationId, loaded, dispatch]);

  if (!conversation)
    return (
      <InboxEmpty
        title="会话已不可用"
        description="请选择其他会话查看来访资料。"
      />
    );
  const name = visitorName(conversation.identity);

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-card"
      aria-label={`${name} 的来访资料`}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-5 py-4">
        <h2 className="text-sm font-semibold">来访资料</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="刷新来访资料"
            disabled={loaded?.status === "loading"}
            onClick={() => void dispatch(loadProfile(conversationId))}
          >
            <RefreshCw data-icon="inline-start" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="收起来访资料"
              onClick={onClose}
            >
              <PanelRightClose data-icon="inline-start" />
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <VisitorAvatar identity={conversation.identity} large />
          <h3 className="max-w-full break-words text-base font-semibold">
            {name}
          </h3>
          <SourceBadge identity={conversation.identity} />
          <p className="max-w-full break-words text-xs text-muted-foreground">
            {conversation.identity.accountName}
          </p>
          <Button
            variant={conversation.starred ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={conversation.starred}
            disabled={star?.status === "saving"}
            onClick={() =>
              void dispatch(
                setConversationStarred(conversationId, !conversation.starred),
              )
            }
          >
            {star?.status === "saving" ? (
              <LoaderCircle
                data-icon="inline-start"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Star
                data-icon="inline-start"
                className={conversation.starred ? "fill-current" : undefined}
              />
            )}
            {star?.status === "saving"
              ? "正在保存星标"
              : conversation.starred
                ? "已加星标"
                : "添加星标"}
          </Button>
          {star?.status === "saved" && (
            <p role="status" className="text-xs text-muted-foreground">
              星标已保存
            </p>
          )}
          {star?.error && (
            <InboxError
              error={star.error}
              compact
              onRetry={() =>
                void dispatch(
                  setConversationStarred(conversationId, !conversation.starred),
                )
              }
            />
          )}
        </div>

        <section className="flex flex-col gap-3" aria-label="渠道资料">
          <h4 className="flex items-center gap-2 text-xs font-semibold">
            <Info className="size-3.5" />
            渠道资料
          </h4>
          <dl className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">来源身份</dt>
              <dd className="break-all font-mono text-[11px]">
                {conversation.identity.externalUserId}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">渠道账号</dt>
              <dd className="break-words text-right">
                {conversation.identity.accountName}
              </dd>
            </div>
            {profile?.fields.map((field) => (
              <div key={field.label} className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="break-words text-right">
                  <ProfileValue field={field.value} />
                </dd>
              </div>
            ))}
          </dl>
          {profile && !profile.fields.length && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              渠道暂未提供更多资料。
            </p>
          )}
          {!profile && loaded?.status !== "error" && (
            <div
              className="flex flex-col gap-3"
              role="status"
              aria-label="正在加载来访资料"
            >
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          )}
          {loaded?.error && (
            <InboxError
              error={loaded.error}
              compact
              onRetry={() => void dispatch(loadProfile(conversationId))}
            />
          )}
        </section>

        {profile && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void dispatch(saveVisitorProfile(conversationId));
            }}
          >
            <FieldGroup className="gap-5">
              <Field className="gap-2">
                <FieldLabel htmlFor={`${id}-tags`} className="text-xs">
                  <Tag className="size-3.5" />
                  来访标签
                </FieldLabel>
                {!dirty && profile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="max-w-full truncate"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  id={`${id}-tags`}
                  value={
                    showEdit ? (edit?.tagsText ?? "") : profile.tags.join("，")
                  }
                  placeholder="例如：待回访，重点咨询"
                  onChange={(event) =>
                    dispatch(
                      editVisitorProfile(conversationId, {
                        tagsText: event.target.value,
                      }),
                    )
                  }
                  aria-describedby={`${id}-tags-help`}
                />
                <FieldDescription
                  id={`${id}-tags-help`}
                  className="text-[11px]"
                >
                  多个标签用逗号分隔，清空后保存可移除全部标签。
                </FieldDescription>
              </Field>
              <Field className="gap-2">
                <FieldLabel htmlFor={`${id}-note`} className="text-xs">
                  <FilePenLine className="size-3.5" />
                  接待备注
                </FieldLabel>
                <Textarea
                  id={`${id}-note`}
                  value={showEdit ? (edit?.note ?? "") : profile.note}
                  placeholder="记下来访用户的偏好与待办事项…"
                  className="min-h-28 resize-y text-xs leading-relaxed"
                  onChange={(event) =>
                    dispatch(
                      editVisitorProfile(conversationId, {
                        note: event.target.value,
                      }),
                    )
                  }
                  aria-describedby={`${id}-note-help`}
                />
                <FieldDescription
                  id={`${id}-note-help`}
                  className="text-[11px]"
                >
                  内部接待记录，不作为聊天消息发送。
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div aria-live="polite" className="flex flex-col gap-2">
              <FieldError>{edit?.error?.message}</FieldError>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {!dirty && edit?.status === "saved" && (
                  <Check className="size-3" />
                )}
                {saving
                  ? "正在保存本次修改…"
                  : edit?.status === "error"
                    ? "修改仍然保留，可以重试保存。"
                    : dirty
                      ? "有未保存的修改"
                      : edit?.status === "saved"
                        ? "已保存"
                        : "资料已读取"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={!dirty || saving}>
                {saving && (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {saving
                  ? "保存中…"
                  : edit?.status === "error"
                    ? "重试保存"
                    : "保存资料"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!dirty || saving}
                onClick={() => dispatch(discardProfileEdits(conversationId))}
              >
                撤销修改
              </Button>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}
