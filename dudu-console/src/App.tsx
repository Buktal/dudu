import { useEffect, useState, useSyncExternalStore } from "react";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext, useSession } from "@/api/context";
import { ConsoleLayout } from "@/components/console-layout";
import { LoadingState } from "@/components/feedback";
import { AccountPage } from "@/features/account/AccountPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { ChannelAccountsPage } from "@/features/channel-accounts/ChannelAccountsPage";
import { EmployeesPage } from "@/features/employees/EmployeesPage";
import { UserGroupsPage } from "@/features/groups/user-groups-page";
import { TranslationPage } from "@/features/translation/TranslationPage";
import { navigate, routes, useRoute } from "@/navigation";

const selectEmployee = (id: string | null) => navigate(routes.employees(id));
const createEmployee = (open: boolean) =>
  navigate(open ? routes.employeeCreate() : routes.employees());
const selectGroup = (id: string | null) => navigate(routes.userGroups(id));
const createGroup = (open: boolean) =>
  navigate(open ? routes.groupCreate() : routes.userGroups());

function Workspace() {
  const route = useRoute();
  const session = useSession();
  const initial = session.profile?.user.isInitialAdmin;
  useEffect(() => {
    if (
      route.view === "login" ||
      ((route.view === "employees" || route.view === "translation") && !initial)
    )
      navigate(initial ? routes.employees() : routes.userGroups());
  }, [route.view, initial]);
  return (
    <ConsoleLayout view={route.view}>
      {route.view === "translation" && initial ? (
        <TranslationPage />
      ) : route.view === "account" ? (
        <AccountPage />
      ) : route.view === "employees" && initial ? (
        <EmployeesPage
          selectedId={route.selectedId}
          creating={route.creating}
          onSelect={selectEmployee}
          onCreate={createEmployee}
        />
      ) : route.view === "user-groups" || route.view === "login" ? (
        <UserGroupsPage
          selectedId={route.selectedId}
          creating={route.creating}
          onSelect={selectGroup}
          onCreate={createGroup}
        />
      ) : route.view === "channel-accounts" ? (
        <ChannelAccountsPage
          selectedId={route.selectedId}
          creating={route.creating}
          groupId={route.groupId}
          // groupId 深链种子只在挂载消费一次，页内导航不回写（防止页内
          // 已清除的组筛选经 URL 复活）；创建入口保留种子作「为该组添加」预选
          onSelect={(id) => navigate(routes.channelAccounts(id))}
          onCreate={(open) =>
            navigate(
              open
                ? routes.channelCreate(route.groupId ?? undefined)
                : routes.channelAccounts(null),
            )
          }
        />
      ) : null}
    </ConsoleLayout>
  );
}
export default function App() {
  const [client] = useState(() => new ConsoleClient());
  const session = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    const controller = new AbortController();
    void client.restore(controller.signal);
    return () => controller.abort();
  }, [client]);
  return (
    <ConsoleContext value={client}>
      {session.restoring ? (
        <LoadingState />
      ) : session.profile ? (
        <Workspace key={session.generation} />
      ) : (
        <LoginPage key={session.generation} />
      )}
    </ConsoleContext>
  );
}
