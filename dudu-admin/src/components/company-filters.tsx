import { RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompanyStatus } from "@/api/types";
import { TextField } from "./form-field";
import { FilterSelect } from "./page-parts";
import { Button } from "./ui/button";
import { FieldGroup } from "./ui/field";

// 筛选栏只上报平台管理员的意图（关键词、状态、重置）；
// 「筛选变化回第一页」等与分页的耦合规则由数据方（useCompanies 等数据模块）决定。
// 搜索草稿是组件私有语义：草稿跟随已应用 keyword（提交、重置后同步），
// 页面不再需要用 remount key 换「重置后清空草稿」。
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
  const [draft, setDraft] = useState(keyword ?? "");
  useEffect(() => {
    setDraft(keyword ?? "");
  }, [keyword]);
  return (
    <form
      aria-label="企业筛选"
      className="filter-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onKeyword(draft.trim() || undefined);
      }}
    >
      <div className="filter-search">
        <FieldGroup className="min-w-0 flex-1">
          <TextField
            label="搜索企业"
            hideLabel
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={100}
            placeholder="搜索企业名称或六位企业 ID"
          />
        </FieldGroup>
        <Button type="submit" variant="secondary">
          <Search data-icon="inline-start" />
          搜索
        </Button>
      </div>
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
      {(draft || keyword || status !== undefined) && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDraft("");
            onReset();
          }}
        >
          <RotateCcw data-icon="inline-start" />
          重置
        </Button>
      )}
    </form>
  );
}
