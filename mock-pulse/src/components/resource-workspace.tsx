import { createContext, type ReactNode, useContext, useState } from "react";
import { StudioButton, StudioDialog } from "./studio-controls";

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
    <div className="workspace-body">
      <aside aria-label={libraryLabel} className="library">
        {library(closeLibrary)}
      </aside>
      <section
        aria-label="编辑工作区"
        className="main-content @container/workspace"
      >
        {children}
      </section>
      <StudioDialog
        open={requested === viewId}
        title={libraryLabel}
        description="搜索并打开一项素材，继续编辑。"
        onClose={closeLibrary}
        footer={<StudioButton onClick={closeLibrary}>关闭</StudioButton>}
      >
        <div className="browse-modal">
          <div className="library">{library(closeLibrary)}</div>
        </div>
      </StudioDialog>
    </div>
  );
}
