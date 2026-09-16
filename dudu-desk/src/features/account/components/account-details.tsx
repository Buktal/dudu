import type { AgentSession } from "../api";
import { AccountAvatar } from "./account-avatar";

export function AccountDetails({ session }: { session: AgentSession }) {
  const rows = [
    ["登录账号", session.agent.username],
    ["坐席编号", session.agent.id],
    ["角色", session.agent.roleName],
    ["所属工作台", session.workspace.name],
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
