import {
  type AccountApi,
  AccountGate,
  AccountMenu,
  AccountProvider,
  useAccount,
} from "@/features/account";
import { type InboxApi, InboxWorkspace } from "@/features/inbox";

function SignedInDesk({ api }: { api?: InboxApi }) {
  const { session } = useAccount();
  if (!session) return null;
  return (
    <InboxWorkspace
      key={`${session.workspace.id}:${session.agent.id}`}
      api={api}
      context={{ workspaceId: session.workspace.id, agentId: session.agent.id }}
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
