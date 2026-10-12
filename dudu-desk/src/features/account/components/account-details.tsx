import type { AgentSession } from "../api";
import { AccountAvatar } from "./account-avatar";

export function AccountDetails({ session }: { session: AgentSession }) {
  const { access } = session;
  // 初始企业管理员自动拥有本企业全部组；其他员工只显示真实成员范围，空范围不表示全组
  const scope = access.allGroups
    ? `全部用户组（${access.groups.length} 个组，${access.accounts.length} 个账号）`
    : access.groups.length > 0
      ? `${access.groups.length} 个用户组，${access.accounts.length} 个账号`
      : "暂无接待权限";
  const rows = [
    ["登录账号", session.agent.username],
    ["坐席编号", session.agent.id],
    ["角色", session.agent.roleName],
    ["所属企业", session.workspace.name],
    ["接待范围", scope],
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 rounded-xl bg-muted p-4">
        <AccountAvatar agent={session.agent} className="size-14" />
        <div className="min-w-0">
          <p className="break-words text-lg font-semibold">
            {session.agent.name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {session.agent.roleName}
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-4 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
