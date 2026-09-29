import { Search } from "lucide-react";
import { useCallback, useState } from "react";
import { adminApi } from "@/api/admin-api";
import { useAdmin } from "@/api/context";
import { type LogQuery, operationActions } from "@/api/types";
import { useQuery } from "@/api/use-query";
import { validCompanyId } from "@/api/validators";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import {
  FilterSelect,
  formatDate,
  PAGE_SIZE,
  PageHeader,
  Pagination,
  RefreshButton,
} from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
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

export function LogsPage() {
  const client = useAdmin();
  const [filters, setFilters] = useState<LogQuery>({
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const query = useQuery(
    useCallback(
      (signal: AbortSignal) => adminApi.logs(client, filters, signal),
      [client, filters],
    ),
  );
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
          setFilters({
            ...filters,
            companyId: companyId || undefined,
            page: 1,
          });
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
            value={filters.action ?? "all"}
            options={[
              { value: "all", label: "全部操作" },
              ...Object.entries(operationActions).map(([value, label]) => ({
                value: value as keyof typeof operationActions,
                label,
              })),
            ]}
            onChange={(action) =>
              setFilters({
                ...filters,
                page: 1,
                action: action === "all" ? undefined : action,
              })
            }
          />
          <FilterSelect<"all" | "success" | "failure">
            label="操作结果"
            value={filters.result ?? "all"}
            options={[
              { value: "all", label: "全部结果" },
              { value: "success", label: "成功" },
              { value: "failure", label: "失败" },
            ]}
            onChange={(result) =>
              setFilters({
                ...filters,
                page: 1,
                result: result === "all" ? undefined : result,
              })
            }
          />
          {(filters.companyId || filters.action || filters.result) && (
            <Button
              variant="ghost"
              onClick={() => {
                setCompanyId("");
                setError(undefined);
                setFilters({ page: 1, pageSize: PAGE_SIZE });
              }}
            >
              重置
            </Button>
          )}
        </div>
      </form>
      <div className="overflow-hidden rounded-xl border bg-card">
        {query.loading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState message={query.error} retry={query.refresh} />
        ) : (
          query.data && (
            <>
              {query.data.list.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>操作时间</TableHead>
                      <TableHead>操作</TableHead>
                      <TableHead>操作对象</TableHead>
                      <TableHead>操作人 ID</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.list.map((log) => (
                      <TableRow key={log.operationLogId}>
                        <TableCell className="text-muted-foreground">
                          {formatDate(log.createTime, true)}
                        </TableCell>
                        <TableCell>
                          {operationActions[log.action] ?? "其他操作"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {log.targetId
                            ? `${log.targetType === "company" ? "企业" : "用户"} ${log.targetId}`
                            : "—"}
                          {log.companyId && log.targetType === "user" && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              企业 {log.companyId}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {log.operatorUserId}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.result === "success"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {log.result === "success" ? "成功" : "失败"}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-48 max-w-md whitespace-normal break-words">
                          {log.summary ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  title="暂无操作记录"
                  description={
                    filters.companyId || filters.action || filters.result
                      ? "未找到符合筛选条件的记录。"
                      : "企业维护与账号操作完成后，可在这里回查结果。"
                  }
                />
              )}
              <Pagination
                {...query.data}
                onChange={(page) => setFilters({ ...filters, page })}
              />
            </>
          )
        )}
      </div>
    </div>
  );
}
