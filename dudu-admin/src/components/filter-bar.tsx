import { RotateCcw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { TextField } from "./form-field";
import { Button } from "./ui/button";
import { FieldGroup } from "./ui/field";

// 筛选栏单点：列表页共用的「草稿-提交-重置」编排只在这里写一次，不变量在此唯一陈述：
// 「输入只改草稿，点搜索才上报（去空格，空串归 undefined）」
// 「草稿跟随已应用值（外部重置清空、换词同步，校验错误一并清除），未提交草稿不受无关渲染影响」
// 「重置立即清空草稿（含校验错误）并上报 onReset，按钮仅在草稿或已应用条件存在时可见」。
// 差异归调用方：搜索字段的标签、占位与校验走 props，立即生效的下拉走 children 槽；
// 「筛选变化回第一页」等与分页的耦合规则由数据方（usePagedQuery）决定，这里只上报意图。
export function FilterBar({
  label,
  searchLabel,
  placeholder,
  maxLength,
  inputMode,
  value,
  validate,
  hasConditions = false,
  onSearch,
  onReset,
  children,
}: {
  // 筛选 form 的无障碍名称（如「企业筛选」）
  label: string;
  // 搜索字段的无障碍标签（可隐藏），如「搜索企业」「企业 ID」
  searchLabel: string;
  placeholder: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  // 已应用的搜索值：只作草稿跟随与重置可见性的真相，不直接进查询
  value?: string;
  // 返回错误文案表示草稿无效：无效草稿不进查询，错误经搜索字段显示
  validate?: (draft: string) => string | undefined;
  // children 槽（立即生效下拉）是否已有已应用条件，参与重置按钮可见性
  hasConditions?: boolean;
  onSearch: (value: string | undefined) => void;
  onReset: () => void;
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | undefined>();
  // 草稿与校验错误同属「用户当前草稿」的状态对：跟随已应用值的外部变化
  // （外部重置回空、换词）时一并清除，外部重置路径不留残留错误
  useEffect(() => {
    setDraft(value ?? "");
    setError(undefined);
  }, [value]);
  return (
    <form
      aria-label={label}
      className="filter-bar"
      onSubmit={(event) => {
        event.preventDefault();
        // 上报去空格后的草稿：空串归 undefined，查询字段只收有效值
        const keyword = draft.trim();
        const invalid = validate?.(keyword);
        if (invalid) {
          setError(invalid);
          return;
        }
        setError(undefined);
        onSearch(keyword || undefined);
      }}
    >
      <div className="filter-search">
        <FieldGroup className="min-w-0 flex-1">
          <TextField
            label={searchLabel}
            hideLabel
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
            maxLength={maxLength}
            inputMode={inputMode}
            error={error}
            placeholder={placeholder}
          />
        </FieldGroup>
        <Button type="submit" variant="secondary">
          <Search data-icon="inline-start" />
          搜索
        </Button>
      </div>
      {children}
      {(draft || value || hasConditions) && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDraft("");
            setError(undefined);
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
