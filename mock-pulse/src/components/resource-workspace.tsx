import { createContext, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/workspace-dialog";

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
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label={libraryLabel}
        className="hidden w-64 shrink-0 flex-col border-r bg-background xl:w-72 min-[900px]:flex"
      >
        {library(closeLibrary)}
      </aside>
      <section
        aria-label="编辑工作区"
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-card @container/workspace"
      >
        {children}
      </section>
      <WorkspaceDialog
        open={requested === viewId}
        title={libraryLabel}
        description="搜索并打开一项素材，继续编辑。"
        onClose={closeLibrary}
        footer={
          <Button onClick={closeLibrary} variant="outline">
            关闭
          </Button>
        }
      >
        <div className="flex h-[65dvh] min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            {library(closeLibrary)}
          </div>
        </div>
      </WorkspaceDialog>
    </div>
  );
}
