import { FileClock, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { operationActions } from "@/api/types";
import { validCompanyId } from "@/api/validators";
import { TextField } from "@/components/form-field";
import {
  FilterSelect,
  formatDate,
  PAGE_SIZE,
  RefreshButton,
} from "@/components/page-parts";
import { QueryView } from "@/components/query-view";
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
import { useLogs } from "./log-data";

export function LogsPage() {
  const query = useLogs({ page: 1, pageSize: PAGE_SIZE });
  // 企业 ID 是提交式草稿：校验通过前不进查询，hook 只收已应用的值。
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const reset = () => {
    setCompanyId("");
    setError(undefined);
    query.reset();
  };
  return (
    <div className="flex flex-col gap-6">
      <QueryView
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
        filters={
          <form
            aria-label="操作记录筛选"
            className="filter-bar"
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
            <div className="filter-search">
              <FieldGroup className="min-w-0 flex-1">
                <TextField
                  label="企业 ID"
                  hideLabel
                  value={companyId}
                  onChange={(event) => {
                    setCompanyId(event.target.value);
                    setError(undefined);
                  }}
                  maxLength={6}
                  inputMode="numeric"
                  error={error}
                  placeholder="搜索六位企业 ID"
                />
              </FieldGroup>
              <Button type="submit" variant="secondary">
                <Search data-icon="inline-start" />
                搜索
              </Button>
            </div>
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
            {(companyId || query.companyId || query.action) && (
              <Button type="button" variant="ghost" onClick={reset}>
                <RotateCcw data-icon="inline-start" />
                重置
              </Button>
            )}
          </form>
        }
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
          icon: FileClock,
          filtered: Boolean(query.companyId) || query.action !== undefined,
          filteredCopy: {
            title: "暂无操作记录",
            description: "未找到符合筛选条件的记录。",
          },
          defaultCopy: {
            title: "暂无操作记录",
            description: "企业维护与账号操作完成后，可在这里回查结果。",
          },
          action: (filtered) =>
            filtered && (
              <Button variant="outline" onClick={reset}>
                清除筛选
              </Button>
            ),
        }}
      >
        <Table aria-label="操作记录">
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
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDate(log.createTime, true)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {operationActions[log.action] ?? "其他操作"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {log.targetId ? (
                    <>
                      <span className="mr-2 text-xs text-muted-foreground">
                        {log.target === "company" ? "企业" : "用户"}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        {log.targetId}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                  {log.companyId && log.target === "user" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      企业 {log.companyId}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
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
