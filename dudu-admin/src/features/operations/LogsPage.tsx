import { Search } from "lucide-react";
import { useState } from "react";
import { operationActions } from "@/api/types";
import { validCompanyId } from "@/api/validators";
import { TextField } from "@/components/form-field";
import {
  FilterSelect,
  formatDate,
  PAGE_SIZE,
  PageHeader,
  RefreshButton,
} from "@/components/page-parts";
import { QueryView } from "@/components/query-view";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLogs } from "./log-data";

export function LogsPage() {
  const query = useLogs({ page: 1, pageSize: PAGE_SIZE });
  // 企业 ID 是提交式草稿：校验通过前不进查询，hook 只收已应用的值。
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="操作记录"
        description="回查企业维护与账号操作的处理结果。"
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
      />
      <form
        className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (companyId && !validCompanyId(companyId)) {
            setError("请输入六位企业 ID");
            return;
          }
          setError(undefined);
          query.setCompanyId(companyId || undefined);
        }}
      >
        <FieldGroup className="min-w-44 flex-1">
          <TextField
            label="企业 ID"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            maxLength={6}
            inputMode="numeric"
            error={error}
            placeholder="按企业 ID 查询"
          />
        </FieldGroup>
        <div className="flex flex-wrap gap-3 pt-7">
          <Button type="submit" variant="outline">
            <Search data-icon="inline-start" />
            查询
          </Button>
          <FilterSelect<keyof typeof operationActions | "all">
            label="操作类型"
            value={query.action ?? "all"}
            options={[
              { value: "all", label: "全部操作" },
              ...Object.entries(operationActions).map(([value, label]) => ({
                value: value as keyof typeof operationActions,
                label,
              })),
            ]}
            onChange={(action) =>
              query.setAction(action === "all" ? undefined : action)
            }
          />
          {(query.companyId || query.action) && (
            <Button
              variant="ghost"
              onClick={() => {
                setCompanyId("");
                setError(undefined);
                query.reset();
              }}
            >
              重置
            </Button>
          )}
        </div>
      </form>
      <QueryView
        count={query.list.length}
        loading={query.loading}
        error={query.error}
        retry={query.refresh}
        pagination={{
          page: query.page,
          pageSize: query.pageSize,
          total: query.total,
          onPage: query.setPage,
        }}
        empty={{
          filtered: Boolean(query.companyId) || query.action !== undefined,
          filteredCopy: {
            title: "暂无操作记录",
            description: "未找到符合筛选条件的记录。",
          },
          defaultCopy: {
            title: "暂无操作记录",
            description: "企业维护与账号操作完成后，可在这里回查结果。",
          },
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>操作时间</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>操作对象</TableHead>
              <TableHead>操作人 ID</TableHead>
              <TableHead>说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.list.map((log) => (
              <TableRow key={log.operationLogId}>
                <TableCell className="text-muted-foreground">
                  {formatDate(log.createTime, true)}
                </TableCell>
                <TableCell>
                  {operationActions[log.action] ?? "其他操作"}
                </TableCell>
                <TableCell className="font-mono">
                  {log.targetId
                    ? `${log.target === "company" ? "企业" : "用户"} ${log.targetId}`
                    : "—"}
                  {log.companyId && log.target === "user" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      企业 {log.companyId}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {log.operatorUserId}
                </TableCell>
                <TableCell className="min-w-48 max-w-md whitespace-normal break-words">
                  {log.summary ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </QueryView>
    </div>
  );
}
