import { FileClock } from "lucide-react";
import { operationActions } from "@/api/types";
import { validCompanyId } from "@/api/validators";
import { FilterBar } from "@/components/filter-bar";
import {
  FilterSelect,
  formatDate,
  PAGE_SIZE,
  RefreshButton,
} from "@/components/page-parts";
import { QueryView } from "@/components/query-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  // 企业 ID 是提交式草稿：校验通过前不进查询，hook 只收已应用的值；
  // 草稿、校验错误与重置编排收敛在 FilterBar 单点。
  // 空态「清除筛选」走 query.reset，草稿经「跟随已应用值」一并清空。
  return (
    <div className="flex flex-col gap-6">
      <QueryView
        actions={
          <RefreshButton loading={query.loading} onClick={query.refresh} />
        }
        filters={
          <FilterBar
            label="操作记录筛选"
            searchLabel="企业 ID"
            placeholder="搜索六位企业 ID"
            maxLength={6}
            inputMode="numeric"
            value={query.companyId}
            validate={(companyId) =>
              companyId !== "" && !validCompanyId(companyId)
                ? "请输入六位企业 ID"
                : undefined
            }
            hasConditions={query.action !== undefined}
            onSearch={query.setCompanyId}
            onReset={query.reset}
          >
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
          </FilterBar>
        }
        query={query}
        empty={{
          icon: FileClock,
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
              <Button variant="outline" onClick={query.reset}>
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
                    {/* action 经 isLog 成员资格校验，键必在 operationActions 中 */}
                    {operationActions[log.action]}
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
