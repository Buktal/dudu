import { SearchIcon, XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export function SearchInput({
  className,
  onClear,
  ...props
}: ComponentProps<typeof InputGroupInput> & { onClear?: () => void }) {
  return (
    <InputGroup className={className}>
      <InputGroupInput {...props} />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      {onClear ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="清除搜索"
            onClick={onClear}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
