import { createContext, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const LibraryContext = createContext({
  requested: "",
  request: (_view: string) => {},
});

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [requested, request] = useState("");
  return (
    <LibraryContext value={{ requested, request }}>{children}</LibraryContext>
  );
}

export function useLibraryDisclosure() {
  return useContext(LibraryContext);
}

export function ResourceWorkspace({
  libraryLabel,
  viewId,
  library,
  children,
}: {
  libraryLabel: string;
  viewId: string;
  library: (closeLibrary: () => void) => ReactNode;
  children: ReactNode;
}) {
  const { requested, request } = useLibraryDisclosure();
  const closeLibrary = () => request("");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <aside
        aria-label={libraryLabel}
        className="hidden w-64 shrink-0 flex-col border-r bg-card min-[900px]:flex xl:w-72"
      >
        {library(closeLibrary)}
      </aside>
      <section
        aria-label="编辑工作区"
        className="@container/workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        {children}
      </section>
      <Sheet
        open={requested === viewId}
        onOpenChange={(open) => !open && closeLibrary()}
      >
        <SheetContent
          side="left"
          showCloseButton={false}
          className="gap-0 data-[side=left]:w-[min(22rem,calc(100vw-2rem))]"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{libraryLabel}</SheetTitle>
            <SheetDescription>搜索并打开一项，继续编辑。</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {library(closeLibrary)}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={closeLibrary}>
              返回工作区
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
