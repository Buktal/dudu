import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

export function IconButton({
  label,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      {...props}
    />
  );
}
