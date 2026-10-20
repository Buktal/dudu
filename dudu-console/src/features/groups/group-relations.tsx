import { useCallback, useState } from "react";
import type { ConsoleClient } from "@/api/client";
import { useConsole, useSession } from "@/api/context";
import { usePagedQuery } from "@/api/paged-query";
import { FilterBar } from "@/components/filter-bar";
import { QueryView } from "@/components/query-view";
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
  DialogTitle,
} from "@/components/ui/dialog";
import { navigate, routes } from "@/navigation";
import {
  type Candidate,
  type Filters,
  groupsApi,
  type Member,
} from "./groups-api";

const initial = { page: 1, pageSize: 20 } as Filters;
const empty = {
  filteredCopy: { title: "未找到匹配员工", description: "调整搜索条件后重试" },
  defaultCopy: {
    title: "暂无成员",
    description: "添加已启用的员工；没有候选时请联系初始管理员创建或启用员工",
  },
};
export function GroupMembers({
  groupId,
  changed,
}: {
  groupId: string;
  changed: () => void;
}) {
  const { profile } = useSession();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const query = usePagedQuery(
    useCallback(
      (c: ConsoleClient, f: Filters, s: AbortSignal) =>
        groupsApi.members(c, groupId, f, s),
      [groupId],
    ),
    initial,
  );
  const refresh = () => {
    query.refresh();
    changed();
  };
  return (
    <div className="space-y-3">
      <Button onClick={() => setAdding(true)}>添加成员</Button>
      <QueryView query={query} empty={empty}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">成员</th>
                <th className="p-3">角色 / 状态</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {query.list.map((member) => (
                <tr key={member.userId} className="border-b">
                  <td className="p-3">
                    {member.name}
                    <p className="text-xs text-muted-foreground">
                      {member.username} · ID {member.userId}
                    </p>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {member.role === "console" ? "管理员" : "普通员工"} /{" "}
                    {member.status === 1 ? "启用" : "停用"}
                  </td>
                  <td className="p-3">
                    {profile?.user.isInitialAdmin || member.role === "user" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemoving(member)}
                      >
                        移除
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        仅初始管理员可维护
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryView>
      {adding && (
        <AddMembers
          groupId={groupId}
          close={() => setAdding(false)}
          changed={refresh}
        />
      )}
      {removing && (
        <RemoveMember
          groupId={groupId}
          member={removing}
          close={() => setRemoving(null)}
          changed={refresh}
        />
      )}
    </div>
  );
}
function AddMembers({
  groupId,
  close,
  changed,
}: {
  groupId: string;
  close: () => void;
  changed: () => void;
}) {
  const client = useConsole();
  const shell = useSubmit();
  const { profile } = useSession();
  const [selected, setSelected] = useState<Candidate | null>(null);
  const query = usePagedQuery(
    useCallback(
      (c: ConsoleClient, f: Filters, s: AbortSignal) =>
        groupsApi.candidates(c, groupId, f, s),
      [groupId],
    ),
    initial,
  );
  return (
    <Dialog open {...shell.hold(close)}>
      <DialogContent
        className="sm:max-w-xl max-h-[90dvh] overflow-y-auto"
        showCloseButton={!shell.pending}
      >
        <DialogTitle>添加成员</DialogTitle>
        <DialogDescription>
          只加入当前组，不修改其他组。候选仅含尚未加入的已启用员工。
        </DialogDescription>
        <QueryView
          query={query}
          empty={empty}
          filters={
            <FilterBar
              label="成员候选筛选"
              searchLabel="搜索成员"
              placeholder="登录名或姓名"
              value={query.filters.keyword}
              onSearch={(keyword) => query.setFilter({ keyword })}
              onReset={query.reset}
            />
          }
        >
          <div className="divide-y">
            {query.list
              .filter(
                (member) =>
                  profile?.user.isInitialAdmin || member.role === "user",
              )
              .map((member) => (
                <form
                  key={member.userId}
                  className="flex items-center justify-between gap-3 p-3"
                  onSubmit={(event) => {
                    setSelected(member);
                    shell.submit(
                      event,
                      () => null,
                      (signal) =>
                        groupsApi.add(client, groupId, member.userId, signal),
                      {
                        commit: () => {
                          setSelected(null);
                          query.refresh();
                          changed();
                        },
                      },
                    );
                  }}
                >
                  <div>
                    {member.name}
                    <p className="text-xs text-muted-foreground">
                      {member.username} · ID {member.userId} ·{" "}
                      {member.role === "console" ? "管理员" : "普通员工"}
                    </p>
                  </div>
                  <SubmitButton
                    shell={shell}
                    label="添加"
                    pendingLabel={
                      selected?.userId === member.userId ? "正在添加" : "请稍候"
                    }
                  />
                </form>
              ))}
          </div>
        </QueryView>
        <SubmitMessage error={shell.error} />
        <Button disabled={shell.pending} variant="outline" onClick={close}>
          完成
        </Button>
      </DialogContent>
    </Dialog>
  );
}
function RemoveMember({
  groupId,
  member,
  close,
  changed,
}: {
  groupId: string;
  member: Member;
  close: () => void;
  changed: () => void;
}) {
  const client = useConsole();
  const shell = useSubmit();
  return (
    <Dialog open {...shell.hold(close)}>
      <DialogContent showCloseButton={!shell.pending}>
        <DialogTitle>移除成员</DialogTitle>
        <DialogDescription>
          将 {member.name}（{member.username}，ID {member.userId}
          ）移出当前组？员工将失去该组接待范围，其他组关系保持不变。
        </DialogDescription>
        <form
          onSubmit={(event) =>
            shell.submit(
              event,
              () => null,
              (signal) =>
                groupsApi.remove(client, groupId, member.userId, signal),
              {
                commit: () => {
                  changed();
                  close();
                },
              },
            )
          }
        >
          <SubmitMessage error={shell.error} />
          <SubmitButton
            shell={shell}
            label="确认移除"
            pendingLabel="正在移除"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function GroupAccounts({ groupId }: { groupId: string }) {
  const query = usePagedQuery(
    useCallback(
      (c: ConsoleClient, f: Filters, s: AbortSignal) =>
        groupsApi.accounts(c, groupId, f, s),
      [groupId],
    ),
    initial,
  );
  return (
    <div className="space-y-3">
      <Button onClick={() => navigate(routes.channelCreate(groupId))}>
        添加渠道账号
      </Button>
      <QueryView
        query={query}
        empty={{
          filteredCopy: { title: "暂无渠道账号", description: "请调整筛选" },
          defaultCopy: {
            title: "暂无渠道账号",
            description: "为当前组添加渠道账号",
          },
        }}
      >
        <div className="divide-y">
          {query.list.map((account) => (
            <button
              type="button"
              className="block w-full text-left p-4 hover:bg-muted"
              key={account.companyChannelId}
              onClick={() =>
                navigate(
                  routes.channelAccounts(account.companyChannelId, groupId),
                )
              }
            >
              <p className="font-medium">{account.accountName}</p>
              <p className="text-xs text-muted-foreground">
                {account.channel} · ID {account.companyChannelId}
              </p>
              <p className="mt-2 text-sm">
                {account.receiveConfigured
                  ? "接收参数已配齐"
                  : "接收参数未配齐"}{" "}
                · {account.sendConfigured ? "发送参数已配齐" : "发送参数未配齐"}
              </p>
            </button>
          ))}
        </div>
      </QueryView>
    </div>
  );
}
