import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { CompanyStatus } from "@/api/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export const PAGE_SIZE = 20;
// 时间串已是北京时间展示文本（yyyy-MM-dd HH:mm:ss），直接截取日期或到分钟
export const formatDate = (value: string, includeTime = false) =>
  includeTime ? value.slice(0, 16) : value.slice(0, 10);

export function RefreshButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="刷新"
      title="刷新"
      disabled={loading}
      onClick={onClick}
    >
      <RefreshCw className={cn(loading && "animate-spin")} />
    </Button>
  );
}

export function StatusBadge({ status }: { status: CompanyStatus }) {
  return (
    <Badge variant="outline">
      <span
        className={cn(
          "status-dot",
          status === 1 ? "status-enabled" : "status-disabled",
        )}
        aria-hidden="true"
      />
      {status === 1 ? "正常启用" : "已停用"}
    </Badge>
  );
}

export function FilterSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-40 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label="分页"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3.5 sm:px-5"
    >
      <span className="text-xs tabular-nums text-muted-foreground">
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft data-icon="inline-start" />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一页
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}
