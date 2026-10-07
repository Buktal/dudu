import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { CompanyFilters } from "@/components/company-filters";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Message,
} from "@/components/feedback";
import {
  formatDate,
  PAGE_SIZE,
  PageHeader,
  Pagination,
  RefreshButton,
  StatusBadge,
} from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompanyAction } from "./CompanyActions";
import { CompanyDetailSheet } from "./CompanyDetailSheet";
import { CreateCompanySheet } from "./CreateCompanySheet";
import { useCompanies } from "./company-data";

export function CompaniesPage({
  selectedId,
  creating,
  navigate,
}: {
  selectedId: string | null;
  creating: boolean;
  navigate: (path: string) => void;
}) {
  const query = useCompanies({ page: 1, pageSize: PAGE_SIZE });
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<CompanyAction | null>(null);
  const open = (id: string, nextAction: CompanyAction | null = null) => {
    setAction(nextAction);
    navigate(`companies?companyId=${id}`);
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="企业管理"
        description="开通企业，维护企业资料与管理员账号。"
        actions={
          <>
            <RefreshButton loading={query.loading} onClick={query.refresh} />
            <Button onClick={() => navigate("companies?create=1")}>
              <Plus data-icon="inline-start" />
              创建企业
            </Button>
          </>
        }
      />
      {message && <Message>{message}</Message>}
      <CompanyFilters
        key={`${query.keyword ?? ""}-reset`}
        keyword={query.keyword}
        status={query.status}
        onKeyword={query.setKeyword}
        onStatus={query.setStatus}
        onReset={query.reset}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        {query.loading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState message={query.error} retry={query.refresh} />
        ) : (
          <>
            {query.list.length === 0 ? (
              <EmptyState
                title={
                  query.keyword || query.status !== undefined
                    ? "未找到符合条件的企业"
                    : "暂无企业"
                }
                description={
                  query.keyword || query.status !== undefined
                    ? "调整搜索关键词或状态后重试。"
                    : "创建第一家企业，开始提供服务。"
                }
              >
                {query.keyword || query.status !== undefined ? (
                  <Button variant="outline" onClick={query.reset}>
                    清除筛选
                  </Button>
                ) : (
                  <Button onClick={() => navigate("companies?create=1")}>
                    创建企业
                  </Button>
                )}
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企业名称</TableHead>
                    <TableHead>企业 ID</TableHead>
                    <TableHead>联系信息</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>开通时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.list.map((company) => (
                    <TableRow key={company.companyId}>
                      <TableCell>
                        <button
                          type="button"
                          className="company-link"
                          onClick={() => open(company.companyId)}
                        >
                          {company.companyName}
                        </button>
                        {company.remark && (
                          <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                            {company.remark}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {company.companyId}
                      </TableCell>
                      <TableCell>
                        <p>{company.contactName ?? "未填写"}</p>
                        {company.contactInfo && (
                          <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground">
                            {company.contactInfo}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={company.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(company.createTime)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" />}
                            aria-label={`${company.companyName}的操作`}
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => open(company.companyId)}
                              >
                                查看详情
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => open(company.companyId, "edit")}
                              >
                                编辑资料
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  open(company.companyId, "status")
                                }
                              >
                                {company.status === 1 ? "停用企业" : "恢复企业"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => open(company.companyId)}
                              >
                                管理员账号
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pagination
              page={query.page}
              pageSize={query.pageSize}
              total={query.total}
              onChange={query.setPage}
            />
          </>
        )}
      </div>
      {creating && (
        <CreateCompanySheet
          close={() => navigate("companies")}
          onCreated={(company) => {
            setMessage(`企业「${company.companyName}」已创建`);
            query.reset();
            setAction(null);
            navigate(`companies?companyId=${company.companyId}`);
          }}
        />
      )}
      {selectedId && (
        <CompanyDetailSheet
          key={selectedId}
          companyId={selectedId}
          initialAction={action}
          close={() => {
            setAction(null);
            navigate("companies");
          }}
          onChanged={setMessage}
        />
      )}
    </div>
  );
}
