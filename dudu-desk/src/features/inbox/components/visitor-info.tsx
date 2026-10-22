import { Check, FilePenLine, Info, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceAction } from "@/components/workspace-action";
import { profileFieldText } from "../channel-profile";
import { useInboxDispatch, useInboxSelector } from "../hooks/use-inbox-store";
import {
  discardProfileEdits,
  editVisitorProfile,
  saveVisitorProfile,
} from "../stores/details";
import { loadProfile } from "../stores/reading";
import { selectConversationById } from "../stores/selectors";
import type { ProfileField } from "../types";
import { ChannelProfileCopy } from "./channel-profile-copy";
import { SourceBadge, VisitorAvatar, visitorName } from "./identity";
import { InboxEmpty, InboxError } from "./inbox-state";
import { VisitorTags } from "./visitor-tags";

function ProfileValue({ field }: { field: ProfileField }) {
  if (field.state === "available") return <span>{field.value}</span>;
  return (
    <span className="text-muted-foreground">{profileFieldText(field)}</span>
  );
}

export function VisitorInfo({
  conversationId,
  closeAction,
}: {
  conversationId: string;
  closeAction?: ReactNode;
}) {
  const dispatch = useInboxDispatch();
  const conversation = useInboxSelector((state) =>
    selectConversationById(state, conversationId),
  );
  const loaded = useInboxSelector(
    (state) => state.inbox.profiles[conversationId],
  );
  const edit = useInboxSelector(
    (state) => state.inbox.profileEdits[conversationId],
  );
  const id = useId();
  const [tagInputReset, setTagInputReset] = useState(0);
  const [overwritePending, setOverwritePending] = useState(false);
  const profile = loaded?.data;
  const dirty = !!edit && edit.revision !== edit.savedRevision;
  const saving = edit?.status === "saving";
  const showEdit = dirty || saving;
  // 服务端版本高于本次编辑的基线：别人已保存过名片，本地输入保留但保存前要确认一次
  const serverUpdated =
    !!profile && !!edit && profile.version > edit.baseVersion;
  const outdated = dirty && serverUpdated;
  const saveStatus = saving
    ? "正在保存本次修改…"
    : edit?.status === "error"
      ? "修改仍然保留，可以重试保存。"
      : dirty
        ? "有未保存的修改"
        : edit?.status === "saved"
          ? "已保存"
          : null;

  // 保存入口：编辑期间收到更新时先提示一次是否覆盖，确认后按普通保存提交
  function requestSave() {
    if (saving) return;
    if (outdated) {
      setOverwritePending(true);
      return;
    }
    void dispatch(saveVisitorProfile(conversationId));
  }

  function confirmOverwrite() {
    setOverwritePending(false);
    void dispatch(saveVisitorProfile(conversationId));
  }

  // 取消覆盖显示最新服务端资料：放弃本地输入，不发起保存
  function cancelOverwrite() {
    setOverwritePending(false);
    dispatch(discardProfileEdits(conversationId));
    setTagInputReset((value) => value + 1);
  }

  useEffect(() => {
    if (conversation && (!loaded || loaded.status === "idle"))
      void dispatch(loadProfile(conversationId));
  }, [conversation, conversationId, loaded, dispatch]);

  if (!conversation)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {closeAction && (
          <div className="flex justify-end px-5 pt-5">{closeAction}</div>
        )}
        <InboxEmpty
          title="会话已不可用"
          description="请选择其他会话查看来访资料。"
        />
      </div>
    );
  const name = visitorName(conversation.identity);

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-l-3xl bg-sidebar text-sidebar-foreground"
      aria-label={`${name} 的来访资料`}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-sm font-semibold">来访资料</h2>
          {(dirty || saving) && (
            <Badge variant="secondary" className="text-[10px]">
              {saving ? "保存中" : "未保存"}
            </Badge>
          )}
          {outdated && (
            <Badge variant="outline" className="text-[10px]">
              资料已被更新
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <WorkspaceAction
            icon={RefreshCw}
            label="刷新来访资料"
            disabled={loaded?.status === "loading"}
            onClick={() => void dispatch(loadProfile(conversationId))}
          />
          {closeAction}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4 pb-4">
        <div className="flex flex-col items-center gap-2 rounded-xl bg-sidebar-accent p-4 text-center">
          <VisitorAvatar identity={conversation.identity} large />
          <h3 className="mt-1 max-w-full break-words text-lg font-semibold tracking-tight">
            {name}
          </h3>
          <SourceBadge identity={conversation.identity} />
          <p className="max-w-full break-words text-[11px] text-muted-foreground">
            {conversation.identity.accountName}
          </p>
        </div>

        <section
          className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground"
          aria-label="渠道资料"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-xs font-semibold">
              <Info className="size-3.5 text-muted-foreground" />
              渠道资料
            </h4>
            <ChannelProfileCopy
              key={conversationId}
              identity={conversation.identity}
              profile={profile}
            />
          </div>
          <dl className="flex flex-col gap-3 text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">渠道账号</dt>
              <dd className="min-w-0 text-right wrap-anywhere">
                {conversation.identity.accountName}
              </dd>
            </div>
            {profile?.fields.map((field) => (
              <div key={field.label} className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="min-w-0 text-right wrap-anywhere">
                  <ProfileValue field={field.value} />
                </dd>
              </div>
            ))}
          </dl>
          <Separator />
          <dl className="flex flex-col gap-1 text-[10px]">
            <dt className="text-muted-foreground">来源身份</dt>
            <dd className="break-all font-mono">
              {conversation.identity.externalUserId}
            </dd>
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
            className="flex flex-col gap-3"
            aria-label={`编辑 ${name} 的接待资料`}
            aria-describedby={saveStatus ? `${id}-save-status` : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              requestSave();
            }}
          >
            <FieldGroup className="gap-3">
              <VisitorTags
                key={`${conversationId}:${tagInputReset}`}
                id={`${id}-tags`}
                value={
                  showEdit ? (edit?.tagsText ?? "") : profile.tags.join("，")
                }
                onChange={(tagsText) =>
                  dispatch(editVisitorProfile(conversationId, { tagsText }))
                }
              />
              <Field className="gap-3 rounded-xl bg-accent p-4 text-accent-foreground">
                <FieldLabel htmlFor={`${id}-note`} className="text-xs">
                  <FilePenLine className="size-3.5 text-muted-foreground" />
                  接待备注
                </FieldLabel>
                <Textarea
                  id={`${id}-note`}
                  value={showEdit ? (edit?.note ?? "") : profile.note}
                  placeholder="记下来访用户的偏好与待办事项…"
                  className="min-h-[70px] resize-y border-0 bg-transparent p-0 text-xs leading-[1.85] shadow-none focus-visible:ring-0"
                  onChange={(event) =>
                    dispatch(
                      editVisitorProfile(conversationId, {
                        note: event.target.value,
                      }),
                    )
                  }
                />
              </Field>
            </FieldGroup>
            {saveStatus && (
              <div
                id={`${id}-save-status`}
                aria-live="polite"
                className="flex flex-col gap-2 px-1"
              >
                <FieldError>{edit?.error?.message}</FieldError>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {!dirty && edit?.status === "saved" && (
                    <Check className="size-3" />
                  )}
                  {saveStatus}
                </p>
              </div>
            )}
            {overwritePending && (
              <Alert
                variant="destructive"
                role="alertdialog"
                aria-label="确认覆盖资料"
                className="rounded-xl px-3 py-2.5"
              >
                <AlertTitle className="text-xs">资料已被他人更新</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 text-[11px]">
                  资料已被他人更新，继续保存会覆盖对方的修改。
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={confirmOverwrite}
                    >
                      确认覆盖
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cancelOverwrite}
                    >
                      取消
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2 px-1">
              <Button type="submit" size="sm" disabled={!dirty || saving}>
                {saving && <Spinner data-icon="inline-start" />}
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
                onClick={() => {
                  setOverwritePending(false);
                  dispatch(discardProfileEdits(conversationId));
                  setTagInputReset((value) => value + 1);
                }}
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
