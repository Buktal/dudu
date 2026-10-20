import { Tabs } from "@base-ui/react/tabs";
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
import { FieldGroup } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div className="flex flex-col gap-6">
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户组</TableHead>
              <TableHead>成员</TableHead>
              <TableHead>渠道账号</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.list.map((group) => (
              <TableRow key={group.groupId}>
                <TableCell>
                  <Button
                    variant="link"
                    onClick={() => onSelect(group.groupId)}
                  >
                    {group.groupName}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    ID {group.groupId}
                  </p>
                </TableCell>
                <TableCell>{group.memberCount}</TableCell>
                <TableCell>{group.channelAccountCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
          className="flex flex-col gap-4"
          onSubmit={(event) =>
            shell.submit(
              event,
              () => (name.trim() ? null : "请输入组名"),
              (signal) => groupsApi.save(client, name, undefined, signal),
              { commit: saved },
            )
          }
        >
          <FieldGroup>
            <TextField
              label="组名"
              value={name}
              maxLength={100}
              disabled={shell.pending}
              onChange={(event) => setName(event.target.value)}
            />
          </FieldGroup>
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
        <div className="flex flex-col gap-5 px-6 pb-6">
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
                <Tabs.Root
                  defaultValue="members"
                  className="flex flex-col gap-4"
                >
                  <Tabs.List aria-label="用户组内容" className="flex gap-2">
                    <Tabs.Tab
                      value="members"
                      render={(props, state) => (
                        <Button
                          {...props}
                          variant={state.active ? "secondary" : "ghost"}
                        />
                      )}
                    >
                      成员
                    </Tabs.Tab>
                    <Tabs.Tab
                      value="accounts"
                      render={(props, state) => (
                        <Button
                          {...props}
                          variant={state.active ? "secondary" : "ghost"}
                        />
                      )}
                    >
                      渠道账号
                    </Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="members">
                    <GroupMembers groupId={groupId} changed={refresh} />
                  </Tabs.Panel>
                  <Tabs.Panel value="accounts">
                    <GroupAccounts groupId={groupId} />
                  </Tabs.Panel>
                </Tabs.Root>
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
      className="flex flex-col gap-3"
      onSubmit={(event) =>
        shell.submit(
          event,
          () => (name.trim() ? null : "请输入组名"),
          (signal) => groupsApi.save(client, name, group.groupId, signal),
          { commit: saved },
        )
      }
    >
      <FieldGroup>
        <TextField
          label="组名"
          maxLength={100}
          value={name}
          disabled={shell.pending}
          onChange={(event) => setName(event.target.value)}
        />
      </FieldGroup>
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
