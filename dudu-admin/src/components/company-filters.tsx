import type { CompanyStatus } from "@/api/types";
import { FilterBar } from "./filter-bar";
import { FilterSelect } from "./page-parts";

// 企业筛选只上报平台管理员的意图（关键词、状态、重置）；
// 「草稿-提交-重置」编排收敛在 FilterBar 单点，这里只组合企业状态下拉。
// 「筛选变化回第一页」等与分页的耦合规则由数据方（useCompanies 等数据模块）决定。
export function CompanyFilters({
  keyword,
  status,
  onKeyword,
  onStatus,
  onReset,
}: {
  keyword?: string;
  status?: CompanyStatus;
  onKeyword: (keyword: string | undefined) => void;
  onStatus: (status: CompanyStatus | undefined) => void;
  onReset: () => void;
}) {
  return (
    <FilterBar
      label="企业筛选"
      searchLabel="搜索企业"
      placeholder="搜索企业名称或六位企业 ID"
      maxLength={100}
      value={keyword}
      hasConditions={status !== undefined}
      onSearch={onKeyword}
      onReset={onReset}
    >
      <FilterSelect<CompanyStatus | "all">
        label="企业状态"
        value={status ?? "all"}
        options={[
          { value: "all", label: "全部状态" },
          { value: 1, label: "正常启用" },
          { value: 0, label: "已停用" },
        ]}
        onChange={(value) => onStatus(value === "all" ? undefined : value)}
      />
    </FilterBar>
  );
}
