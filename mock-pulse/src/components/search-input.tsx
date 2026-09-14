import { SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

export function SearchInput(props: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup>
      <InputGroupInput {...props} />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
    </InputGroup>
  );
}
