import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { useConsoleQuery } from "@/api/console-query";
import { useConsole, useSession } from "@/api/context";
import { ErrorState, LoadingState } from "@/components/feedback";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AccountEditor } from "./AccountEditor";
import {
  type AccountDetail,
  type ChannelDefinition,
  channelApi,
  type GroupOption,
} from "./api";
export function ConfigurationStatus({
  account,
}: {
  account:
    | AccountDetail
    | {
        receiveConfigured: boolean;
        sendConfigured: boolean;
        missingReceiveFields: string[];
        missingSendFields: string[];
      };
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        接收参数：
        {account.receiveConfigured
          ? "齐全"
          : `缺少 ${account.missingReceiveFields.join("、") || "必要配置"}`}
      </p>
      <p>
        发送参数：
        {account.sendConfigured
          ? "齐全"
          : `缺少 ${account.missingSendFields.join("、") || "必要配置"}`}
      </p>
    </div>
  );
}
export function AccountDetailPanel({
  id,
  definitions,
  groups,
  onClose,
  onChanged,
}: {
  id: string;
  definitions: ChannelDefinition[];
  groups: GroupOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copy, setCopy] = useState("");
  const load = async (
    client: Parameters<typeof channelApi.detail>[0],
    accountId: string,
    signal: AbortSignal,
  ) => {
    try {
      return await channelApi.detail(client, accountId, signal);
    } catch (error) {
      if (error instanceof ApiError && error.code === 12100) onClose();
      throw error;
    }
  };
  // 查询函数由稳定包装捕获页面关闭动作；id 切换由父级 key 隔离。
  const [loader] = useState(() => load);
  const query = useConsoleQuery(loader, [id]);
  const account = query.data;
  const definition = definitions.find((d) => d.channel === account?.channel);
  const saved = () => {
    setEditing(false);
    setMoving(false);
    query.refresh();
    onChanged();
  };
  return (
    <>
      {editing && account ? (
        <AccountEditor
          definitions={definitions}
          groups={groups}
          detail={account}
          initialGroup={null}
          onClose={() => setEditing(false)}
          onSaved={saved}
          onUnavailable={onClose}
        />
      ) : (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>{account?.accountName ?? "渠道账号详情"}</SheetTitle>
              <SheetDescription>参数配置情况与渠道侧准备</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 p-6">
              {query.loading ? (
                <LoadingState />
              ) : query.error ? (
                <ErrorState message={query.error} retry={query.refresh} />
              ) : (
                account && (
                  <>
                    <dl className="detail-grid">
                      <dt>账号 ID</dt>
                      <dd>{account.companyChannelId}</dd>
                      <dt>渠道</dt>
                      <dd>{definition?.name ?? account.channel}</dd>
                      <dt>用户组</dt>
                      <dd>
                        {account.groupName} · {account.groupId}
                      </dd>
                    </dl>
                    <ConfigurationStatus account={account} />
                    <p className="text-sm text-muted-foreground">
                      参数存在不代表授权有效或生产可收发，请在渠道平台配置并验证。
                    </p>
                    <div className="flex flex-col gap-2">
                      <h3 className="font-medium">回调地址</h3>
                      <p className="break-all rounded-lg border p-3 text-sm">
                        {account.callbackUrl}
                      </p>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              account.callbackUrl,
                            );
                            setCopy("已复制回调地址");
                          } catch {
                            setCopy("复制失败，请手动选择回调地址复制");
                          }
                        }}
                      >
                        复制回调地址
                      </Button>
                      <p role="status" className="text-sm">
                        {copy}
                      </p>
                    </div>
                    {definition?.fields.map((f) => (
                      <div
                        key={f.key}
                        className="flex justify-between gap-4 text-sm"
                      >
                        <span>{f.label}</span>
                        <span className="max-w-80 whitespace-pre-wrap break-all">
                          {f.secret
                            ? account.configuredSecretFields.includes(f.key)
                              ? "已配置"
                              : "未配置"
                            : account.fields[f.key] || "未配置"}
                        </span>
                      </div>
                    ))}
                    {[
                      ...new Set([
                        ...(definition?.notes ?? []),
                        ...account.notes,
                      ]),
                    ].map((note) => (
                      <p key={note} className="text-sm text-muted-foreground">
                        {note}
                      </p>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        disabled={!definition}
                        onClick={() => setEditing(true)}
                      >
                        维护名称与凭据
                      </Button>
                      <Button variant="outline" onClick={() => setMoving(true)}>
                        调整所属组
                      </Button>
                    </div>
                  </>
                )
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
      {moving && account && (
        <MoveAccount
          account={account}
          groups={groups}
          onClose={() => setMoving(false)}
          onSaved={saved}
          onUnavailable={onClose}
        />
      )}
    </>
  );
}
function MoveAccount({
  account,
  groups,
  onClose,
  onSaved,
  onUnavailable,
}: {
  account: AccountDetail;
  groups: GroupOption[];
  onClose: () => void;
  onSaved: () => void;
  onUnavailable: () => void;
}) {
  const client = useConsole();
  const { profile } = useSession();
  const shell = useSubmit();
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const manages = (id: string) =>
    !!profile &&
    (profile.user.isInitialAdmin || profile.managedGroupIds.includes(id));
  useEffect(() => {
    if (!manages(account.groupId)) onUnavailable();
  });
  return (
    <Dialog open onOpenChange={shell.hold(onClose).onOpenChange}>
      <DialogContent showCloseButton={!shell.pending}>
        <DialogHeader>
          <DialogTitle>调整所属组</DialogTitle>
          <DialogDescription>
            {account.accountName} · {account.companyChannelId}
            。旧组将失去此账号及全部历史的访问，新组将取得同一份访客、会话与消息历史。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) =>
            shell.submit(
              e,
              () =>
                !target
                  ? "请选择目标组"
                  : !confirmed
                    ? "请确认历史可见性变化"
                    : !manages(account.groupId) || !manages(target)
                      ? "必须同时有源组和目标组的管理权限"
                      : null,
              (signal) =>
                channelApi.move(
                  client,
                  account.companyChannelId,
                  target,
                  signal,
                ),
              {
                commit: onSaved,
                onError: (error) => {
                  if (error instanceof ApiError && error.code === 12100)
                    onUnavailable();
                },
              },
            )
          }
        >
          <SubmitMessage error={shell.error} />
          <label className="grid gap-2 text-sm">
            目标用户组
            <select
              value={target}
              disabled={shell.pending}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 rounded-lg border bg-background px-3"
            >
              <option value="">请选择目标组</option>
              {groups
                .filter(
                  (g) => g.groupId !== account.groupId && manages(g.groupId),
                )
                .map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.groupName} · {g.groupId}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={shell.pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已确认历史可见性将随所属组变化
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={shell.pending}
            >
              取消
            </Button>
            <SubmitButton
              shell={shell}
              label="确认换组"
              pendingLabel="正在换组"
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
