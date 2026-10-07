import { Search } from "lucide-react";
import { useState } from "react";
import type { CompanyStatus } from "@/api/types";
import { FilterSelect } from "./page-parts";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

// 筛选栏只上报平台管理员的意图（关键词、状态、重置）；
// 「筛选变化回第一页」等与分页的耦合规则由数据方（useCompanies 或页面本地状态）决定。
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
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onKeyword(draft.trim() || undefined);
      }}
    >
      <FieldGroup className="min-w-48 flex-1">
        <Field>
          <FieldLabel htmlFor="company-keyword" className="sr-only">
            搜索企业
          </FieldLabel>
          <Input
            id="company-keyword"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={100}
            placeholder="搜索企业名称或六位企业 ID"
          />
        </Field>
      </FieldGroup>
      <Button type="submit" variant="outline">
        <Search data-icon="inline-start" />
        搜索
      </Button>
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
      {(keyword || status !== undefined) && (
        <Button
          variant="ghost"
          onClick={() => {
            setDraft("");
            onReset();
          }}
        >
          重置
        </Button>
      )}
    </form>
  );
}
