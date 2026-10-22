import { useEffect, useState } from "react";
import { useConsoleQuery } from "@/api/console-query";
import { useConsole, useSession } from "@/api/context";
import { isMissingEntity, useEntityGuard } from "@/api/entity-guard";
import { ErrorState, LoadingState } from "@/components/feedback";
import { SelectField } from "@/components/form-field";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  notify,
}: {
  id: string;
  definitions: ChannelDefinition[];
  groups: GroupOption[];
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copy, setCopy] = useState("");
  // 账号被删除或当前身份不可见时收起详情弹层：实体缺失守卫单点编排，
  // 包装身份稳定且回调始终读取最新闭包；id 切换由父级 key 隔离。
  const load = useEntityGuard(channelApi.detail, () => {
    setEditing(false);
    setMoving(false);
    onClose();
  });
  const query = useConsoleQuery(load, [id]);
  const account = query.data;
  const definition = definitions.find((d) => d.channel === account?.channel);
  // 写成功后的本地收尾：详情与列表重查由 dataRevision 驱动，这里只关弹层与旁路通知
  const saved = () => {
    setEditing(false);
    setMoving(false);
    notify("参数已保存，请在渠道平台配置并验证。");
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
          onUnavailable={() => {
            setEditing(false);
            onClose();
          }}
        />
      ) : (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <SheetContent className="data-[side=right]:w-full! overflow-y-auto data-[side=right]:sm:max-w-xl!">
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
                        disabled={
                          !definition ||
                          account.missingReceiveFields.includes("system")
                        }
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
  // 权限守卫：对源组无管理权限即退出换组流程；依赖限定在权限真相上，
  // onUnavailable 只表达关闭意图，身份随渲染变化不重跑守卫。
  // biome-ignore lint/correctness/useExhaustiveDependencies: onUnavailable 的关闭意图不随身份变化，重跑只属于权限真相。
  useEffect(() => {
    if (!manages(account.groupId)) onUnavailable();
  }, [account.groupId, profile]);
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
                  if (isMissingEntity(error)) onUnavailable();
                },
              },
            )
          }
        >
          <SubmitMessage error={shell.error} />
          <FieldGroup>
            <SelectField
              label="目标用户组"
              value={target}
              disabled={shell.pending}
              onChange={setTarget}
              options={[
                { value: "", label: "请选择目标组" },
                ...groups
                  .filter(
                    (g) => g.groupId !== account.groupId && manages(g.groupId),
                  )
                  .map((g) => ({
                    value: g.groupId,
                    label: `${g.groupName} · ${g.groupId}`,
                  })),
              ]}
            />
            <Field orientation="horizontal">
              <FieldLabel>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={shell.pending}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已确认历史可见性将随所属组变化
              </FieldLabel>
            </Field>
          </FieldGroup>
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
