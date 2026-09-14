import type { ComponentProps } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function Notice({ children, ...props }: ComponentProps<typeof Alert>) {
  return (
    <Alert {...props}>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        {children}
      </AlertDescription>
    </Alert>
  );
}
