import { Search } from "lucide-react";
import { useState } from "react";
import type { CompanyQuery, CompanyStatus } from "@/api/types";
import { FilterSelect } from "./page-parts";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function CompanyFilters({
  query,
  onChange,
}: {
  query: CompanyQuery;
  onChange: (query: CompanyQuery) => void;
}) {
  const [keyword, setKeyword] = useState(query.keyword ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onChange({ ...query, page: 1, keyword: keyword.trim() || undefined });
      }}
    >
      <FieldGroup className="min-w-48 flex-1">
        <Field>
          <FieldLabel htmlFor="company-keyword" className="sr-only">
            搜索企业
          </FieldLabel>
          <Input
            id="company-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
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
        value={query.status ?? "all"}
        options={[
          { value: "all", label: "全部状态" },
          { value: "enabled", label: "正常启用" },
          { value: "disabled", label: "已停用" },
        ]}
        onChange={(status) =>
          onChange({
            ...query,
            page: 1,
            status: status === "all" ? undefined : status,
          })
        }
      />
      {(query.keyword || query.status) && (
        <Button
          variant="ghost"
          onClick={() => {
            setKeyword("");
            onChange({ page: 1, pageSize: query.pageSize });
          }}
        >
          重置
        </Button>
      )}
    </form>
  );
}
