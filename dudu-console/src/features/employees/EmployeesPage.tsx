import { useCallback, useState } from "react";
import { useSession } from "@/api/context";
import { usePagedQuery } from "@/api/paged-query";
import { Message } from "@/components/feedback";
import { FilterBar } from "@/components/filter-bar";
import {
  FilterSelect,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { QueryView } from "@/components/query-view";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type EmployeeFilters, queryEmployees } from "./api";
import { EmployeeDetail } from "./EmployeeDetail";
import { EmployeeForm } from "./EmployeeForm";
export function EmployeesPage({
  selectedId,
  creating,
  onSelect,
  onCreate,
}: {
  selectedId: string | null;
  creating: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (creating: boolean) => void;
}) {
  const profile = useSession().profile;
  if (!profile?.user.isInitialAdmin)
    return <Message error>仅初始企业管理员可管理员工。</Message>;
  return (
    <EmployeeList
      selectedId={selectedId}
      creating={creating}
      onSelect={onSelect}
      onCreate={onCreate}
    />
  );
}
function EmployeeList({
  selectedId,
  creating,
  onSelect,
  onCreate,
}: {
  selectedId: string | null;
  creating: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (creating: boolean) => void;
}) {
  const query = usePagedQuery(queryEmployees, {
    page: 1,
    pageSize: 20,
  } as EmployeeFilters);
  const [notice, setNotice] = useState<string | null>(null);
  const closeDetail = useCallback(() => onSelect(null), [onSelect]);
  const changed = (message: string) => {
    setNotice(message);
    query.refresh();
  };
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">员工</h1>
          <p className="text-sm text-muted-foreground">
            维护企业员工及其登录权限；接待范围由用户组管理。
          </p>
        </div>
        <Button onClick={() => onCreate(true)}>创建员工</Button>
      </div>
      {notice && <Message>{notice}</Message>}
      <QueryView
        query={query}
        filters={
          <FilterBar
            label="员工筛选"
            searchLabel="登录名或显示名称"
            placeholder="搜索登录名或显示名称"
            value={query.filters.keyword}
            hasConditions={
              query.filters.status !== undefined ||
              query.filters.role !== undefined
            }
            onSearch={(keyword) => query.setFilter({ keyword })}
            onReset={query.reset}
          >
            <FilterSelect
              label="角色"
              value={query.filters.role ?? "all"}
              options={[
                { value: "all", label: "全部角色" },
                { value: "user", label: "普通员工" },
                { value: "console", label: "企业管理员" },
              ]}
              onChange={(value) =>
                query.setFilter({
                  role:
                    value === "all" ? undefined : (value as "user" | "console"),
                })
              }
            />
            <FilterSelect
              label="状态"
              value={
                query.filters.status === undefined
                  ? "all"
                  : String(query.filters.status)
              }
              options={[
                { value: "all", label: "全部状态" },
                { value: "1", label: "正常启用" },
                { value: "0", label: "已停用" },
              ]}
              onChange={(value) =>
                query.setFilter({
                  status: value === "all" ? undefined : value === "1" ? 1 : 0,
                })
              }
            />
          </FilterBar>
        }
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
        empty={{
          defaultCopy: {
            title: "尚无员工",
            description: "创建员工后，可将其加入用户组以获得接待范围。",
          },
          filteredCopy: {
            title: "未找到符合条件的员工",
            description: "请调整筛选条件后重试。",
          },
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>员工</TableHead>
              <TableHead>登录名</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.list.map((employee) => (
              <TableRow key={employee.userId}>
                <TableCell>
                  <div className="font-medium">{employee.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID {employee.userId}
                  </div>
                </TableCell>
                <TableCell>{employee.username}</TableCell>
                <TableCell>
                  {employee.isInitialAdmin
                    ? "初始企业管理员"
                    : employee.role === "console"
                      ? "企业管理员"
                      : "普通员工"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={employee.status} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(employee.userId)}
                    aria-label={`查看 ${employee.name}`}
                  >
                    查看详情
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </QueryView>
      {creating && (
        <EmployeeForm
          close={() => onCreate(false)}
          saved={(_, message) => {
            onCreate(false);
            changed(message);
          }}
        />
      )}
      {selectedId && (
        <EmployeeDetail
          key={selectedId}
          id={selectedId}
          close={closeDetail}
          changed={changed}
        />
      )}
    </div>
  );
}
