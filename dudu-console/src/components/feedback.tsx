import {
  AlertCircle,
  Building2,
  CheckCircle2,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

export function Message({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
    >
      {error ? <AlertCircle /> : <CheckCircle2 />}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function LoadingState() {
  return (
    <div
      className="flex flex-col gap-4 p-8"
      role="status"
      aria-label="正在加载"
    >
      <span className="sr-only">正在加载</span>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Empty role="alert" className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircle />
        </EmptyMedia>
        <EmptyTitle>暂时无法加载</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={retry}>
          重试
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function EmptyState({
  title,
  description,
  children,
  icon: Icon = Building2,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

export function PendingLabel({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {pending && (
        <LoaderCircle className="animate-spin" data-icon="inline-start" />
      )}
      {children}
    </>
  );
}
