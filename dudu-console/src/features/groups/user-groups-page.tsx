import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { useConsoleQuery } from "@/api/console-query";
import { useConsole, useSession } from "@/api/context";
import { usePagedQuery } from "@/api/paged-query";
import { ErrorState, LoadingState, Message } from "@/components/feedback";
import { FilterBar } from "@/components/filter-bar";
import { TextField } from "@/components/form-field";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GroupAccounts, GroupMembers } from "./group-relations";
import { type Group, groupsApi } from "./groups-api";

const firstPage = { page: 1, pageSize: 20 };
export function UserGroupsPage({
  selectedId,
  creating,
  onSelect,
  onCreate,
}: {
  selectedId: string | null;
  creating: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (value: boolean) => void;
}) {
  const query = usePagedQuery(
    groupsApi.query,
    firstPage as { page: number; pageSize: number; keyword?: string },
  );
  const { profile } = useSession();
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">用户组</h1>
          <p className="text-sm text-muted-foreground">
            管理成员与渠道账号的接待范围
          </p>
        </div>
        {profile?.user.isInitialAdmin && (
          <Button onClick={() => onCreate(true)}>创建用户组</Button>
        )}
      </header>
      <QueryView
        query={query}
        filters={
          <FilterBar
            label="用户组筛选"
            searchLabel="搜索组名"
            placeholder="搜索组名"
            value={query.filters.keyword}
            onSearch={(keyword) => query.setFilter({ keyword })}
            onReset={query.reset}
          />
        }
        empty={{
          filteredCopy: {
            title: "未找到用户组",
            description: "调整搜索条件后重试",
          },
          defaultCopy: {
            title: "暂无可管理的用户组",
            description: profile?.user.isInitialAdmin
              ? "创建用户组后添加成员和渠道账号"
              : "请联系初始管理员分配用户组",
          },
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-4">用户组</th>
                <th className="p-4">成员</th>
                <th className="p-4">渠道账号</th>
              </tr>
            </thead>
            <tbody>
              {query.list.map((group) => (
                <tr className="border-b" key={group.groupId}>
                  <td className="p-4">
                    <Button
                      variant="link"
                      onClick={() => onSelect(group.groupId)}
                    >
                      {group.groupName}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      ID {group.groupId}
                    </p>
                  </td>
                  <td className="p-4">{group.memberCount}</td>
                  <td className="p-4">{group.channelAccountCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryView>
      {creating && profile?.user.isInitialAdmin && (
        <CreateGroup
          close={() => onCreate(false)}
          saved={(group) => {
            query.refresh();
            onCreate(false);
            onSelect(group.groupId);
          }}
        />
      )}
      {selectedId && (
        <GroupDetail
          key={selectedId}
          groupId={selectedId}
          changed={query.refresh}
          close={() => onSelect(null)}
        />
      )}
    </div>
  );
}
function CreateGroup({
  close,
  saved,
}: {
  close: () => void;
  saved: (group: Group) => void;
}) {
  const client = useConsole();
  const shell = useSubmit();
  const [name, setName] = useState("");
  return (
    <Dialog open {...shell.hold(close)}>
      <DialogContent showCloseButton={!shell.pending}>
        <DialogTitle>创建用户组</DialogTitle>
        <DialogDescription>
          用户组平级，可以同名；创建后添加成员和渠道账号。
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) =>
            shell.submit(
              event,
              () => (name.trim() ? null : "请输入组名"),
              (signal) => groupsApi.save(client, name, undefined, signal),
              { commit: saved },
            )
          }
        >
          <TextField
            label="组名"
            value={name}
            maxLength={100}
            disabled={shell.pending}
            onChange={(event) => setName(event.target.value)}
          />
          <SubmitMessage error={shell.error} />
          <SubmitButton
            shell={shell}
            label="创建用户组"
            pendingLabel="正在创建"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
function GroupDetail({
  groupId,
  changed,
  close,
}: {
  groupId: string;
  changed: () => void;
  close: () => void;
}) {
  const shell = useSubmit();
  const [tab, setTab] = useState("members");

  const query = useConsoleQuery(loadGroup, [groupId]);
  useEffect(() => {
    if (query.data === null && !query.loading && !query.error) {
      close();
      changed();
    }
  }, [query.data, query.loading, query.error, close, changed]);
  const refresh = () => {
    query.refresh();
    changed();
  };
  return (
    <Sheet open {...shell.hold(close)}>
      <SheetContent
        className="!w-full !max-w-3xl overflow-y-auto"
        showCloseButton={!shell.pending}
      >
        <SheetHeader>
          <SheetTitle>{query.data?.groupName ?? "用户组详情"}</SheetTitle>
          <SheetDescription>组 ID {groupId}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-6 pb-6">
          {query.loading ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState message={query.error} retry={query.refresh} />
          ) : (
            query.data && (
              <>
                <RenameGroup
                  key={`${groupId}:${query.data.groupName}`}
                  group={query.data}
                  shell={shell}
                  saved={refresh}
                />
                <Message>
                  初始管理员自动拥有权限，不计入实际成员，也无需添加。成员操作仅影响当前组，保留员工的其他组关系。
                </Message>
                <div className="flex gap-2">
                  <Button
                    variant={tab === "members" ? "secondary" : "ghost"}
                    onClick={() => setTab("members")}
                  >
                    成员
                  </Button>
                  <Button
                    variant={tab === "accounts" ? "secondary" : "ghost"}
                    onClick={() => setTab("accounts")}
                  >
                    渠道账号
                  </Button>
                </div>
                {tab === "members" ? (
                  <GroupMembers groupId={groupId} changed={refresh} />
                ) : (
                  <GroupAccounts groupId={groupId} />
                )}
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
function RenameGroup({
  group,
  shell,
  saved,
}: {
  group: Group;
  shell: ReturnType<typeof useSubmit>;
  saved: () => void;
}) {
  const client = useConsole();
  const [name, setName] = useState(group.groupName);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) =>
        shell.submit(
          event,
          () => (name.trim() ? null : "请输入组名"),
          (signal) => groupsApi.save(client, name, group.groupId, signal),
          { commit: saved },
        )
      }
    >
      <TextField
        label="组名"
        maxLength={100}
        value={name}
        disabled={shell.pending}
        onChange={(event) => setName(event.target.value)}
      />
      <SubmitMessage error={shell.error} />
      <SubmitButton
        shell={shell}
        label="保存组名"
        pendingLabel="正在保存"
        disabled={name.trim() === group.groupName}
      />
    </form>
  );
}
async function loadGroup(
  client: import("@/api/client").ConsoleClient,
  groupId: string,
  signal: AbortSignal,
) {
  try {
    return await groupsApi.detail(client, groupId, signal);
  } catch (error) {
    if (error instanceof ApiError && error.code === 12100) return null;
    throw error;
  }
}
