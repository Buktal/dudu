import { useCallback } from "react";
import {
  type AccountApi,
  AccountGate,
  AccountMenu,
  AccountProvider,
  useAccount,
} from "@/features/account";
import { type InboxApi, InboxWorkspace } from "@/features/inbox";

function SignedInDesk({ api }: { api?: InboxApi }) {
  const account = useAccount();
  const { session, refresh } = account;
  // 权限范围变化时的工作区重查身份：账户会话方法本身稳定，回调只按它固定
  const refreshAccess = useCallback(async () => {
    const renewed = await refresh();
    return renewed
      ? new Set(renewed.access.accounts.map((item) => item.companyChannelId))
      : null;
  }, [refresh]);
  if (!session) return null;
  return (
    <InboxWorkspace
      key={`${session.workspace.id}:${session.agent.id}`}
      api={api}
      context={{ workspaceId: session.workspace.id, agentId: session.agent.id }}
      refreshAccess={refreshAccess}
      accountMenu={<AccountMenu />}
    />
  );
}

function App({
  accountApi,
  inboxApi,
}: {
  accountApi?: AccountApi;
  inboxApi?: InboxApi;
}) {
  return (
    <AccountProvider api={accountApi}>
      <AccountGate>
        <SignedInDesk api={inboxApi} />
      </AccountGate>
    </AccountProvider>
  );
}

export default App;
