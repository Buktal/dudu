// One prototype workspace with three reception modes: ?variant=A|C|E (1, 3, 5).

import { MessageCircle } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  filterVisitors,
  type QueueOptions,
} from "./features/inbox/conversation-list";
import { useInbox } from "./features/inbox/use-inbox";
import { palettes, readPalette, savePalette } from "./lib/theme-palette";
import { cn } from "./lib/utils";
import {
  DesignGuide,
  PrototypeDock,
  ScenarioPanel,
} from "./prototype-controls";
import { ReceptionToolbar } from "./reception-toolbar";
import type { Variant } from "./types";
import { VariantA, type WorkspaceProps } from "./variants";
import { VariantC } from "./variants/parallel";
import { VariantE } from "./variants/stream";

function readVariant(): Variant {
  const value =
    new URLSearchParams(window.location.hash.slice(1)).get("variant") ??
    new URLSearchParams(window.location.search).get("variant");
  return value === "C" || value === "E" ? value : "A";
}
const initialOptions: QueueOptions = {
  query: "",
  filter: "all",
  channel: "all",
  order: "wait",
};

export default function App() {
  const inbox = useInbox();
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [palette, setPalette] = useState(readPalette);
  const [currentId, setCurrentId] = useState("lin");
  const [primaryId, setPrimaryId] = useState("lin");
  const [companionId, setCompanionId] = useState("zhou");
  const [companionOpen, setCompanionOpen] = useState(true);
  const [focus, setFocus] = useState(0);
  const [options, setQueueOptions] = useState(initialOptions);
  const [infoOpen, setInfoOpen] = useState(() => window.innerWidth >= 1090);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [away, setAway] = useState(false);
  const [mobileQueue, setMobileQueue] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const currentRef = useRef(currentId);
  currentRef.current = currentId;
  const visitor =
    inbox.visitors.find((item) => item.id === currentId) ?? inbox.visitors[0];
  const primary =
    inbox.visitors.find((item) => item.id === primaryId) ?? inbox.visitors[0];
  const companion =
    inbox.visitors.find((item) => item.id === companionId) ?? inbox.visitors[2];
  const queue = filterVisitors(inbox.visitors, options);

  function search() {
    if (variant === "A" || variant === "C")
      setMobileQueue(window.innerWidth <= 760);
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    );
  }
  function changeVariant(value: Variant) {
    if (value === variant) return;
    if (value === "C") {
      if (companionOpen && currentId === companionId) setFocus(1);
      else {
        setPrimaryId(currentId);
        setFocus(0);
      }
    }
    setVariant(value);
    setMobileQueue(false);
  }
  function select(id: string) {
    if (variant === "C") {
      if (companionOpen && id === companionId) setFocus(1);
      else {
        setPrimaryId(id);
        setFocus(0);
      }
    }
    setCurrentId(id);
    inbox.markRead(id);
    setMobileQueue(false);
  }
  function focusPane(slot: number) {
    if (slot === 1 && !companionOpen) return;
    setFocus(slot);
    const id = slot === 0 ? primaryId : companionId;
    setCurrentId(id);
    inbox.markRead(id);
  }
  function next(fromId: string) {
    if (fromId !== currentRef.current) return;
    const target = filterVisitors(inbox.visitors, {
      ...initialOptions,
      filter: "needs-reply",
    }).find((item) => item.id !== fromId && item.replyOpen);
    if (target) {
      select(target.id);
      inbox.notify(`现在接待 ${target.name}，草稿跟随每位访客保留`);
    } else inbox.notify("当前没有其他可以回复的待接待访客");
  }
  function parallel(id: string) {
    if (id === primaryId) {
      const other =
        companionId !== id
          ? companionId
          : inbox.visitors.find((item) => item.id !== id)?.id;
      if (other) setPrimaryId(other);
    }
    setCompanionId(id);
    setCompanionOpen(true);
    setFocus(1);
    setCurrentId(id);
    inbox.markRead(id);
    setMobileQueue(false);
    inbox.notify(
      `已将 ${inbox.visitors.find((item) => item.id === id)?.name} 固定在右窗，左窗仍可切换其他访客`,
    );
  }
  function closeCompanion() {
    setCompanionOpen(false);
    setFocus(0);
    setCurrentId(primaryId);
    inbox.notify("已收起第二窗，访客的草稿仍然保留");
  }
  function reset() {
    inbox.reset();
    setCurrentId("lin");
    setPrimaryId("lin");
    setCompanionId("zhou");
    setCompanionOpen(true);
    setFocus(0);
    setQueueOptions(initialOptions);
    setInfoOpen(window.innerWidth >= 1090);
    setResetVersion((value) => value + 1);
  }
  useEffect(() => {
    savePalette(palette);
  }, [palette]);
  useEffect(() => {
    if (window.location.protocol === "file:")
      window.location.hash = `variant=${variant}&palette=${palette}`;
    else {
      const url = new URL(window.location.href);
      url.searchParams.set("variant", variant);
      url.searchParams.set("palette", palette);
      url.hash = "";
      window.history.replaceState({}, "", url);
    }
  }, [variant, palette]);
  useEffect(() => {
    const update = () => {
      changeVariant(readVariant());
      setPalette(readPalette());
    };
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  });
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        helpOpen ||
        scenariosOpen ||
        (event.target as HTMLElement).closest("dialog")
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        search();
        return;
      }
      if (
        event.altKey &&
        variant === "C" &&
        (event.key === "1" || event.key === "2")
      ) {
        event.preventDefault();
        focusPane(Number(event.key) - 1);
        return;
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const props: WorkspaceProps = {
    inbox,
    visitor,
    primary,
    companion,
    companionOpen,
    closeCompanion,
    focus,
    queue,
    options,
    setOptions: (change) =>
      setQueueOptions((previous) => ({ ...previous, ...change })),
    select,
    parallel,
    focusPane,
    next,
    infoOpen,
    setInfoOpen,
    openHelp: () => setHelpOpen(true),
    mobileQueue,
    toggleQueue: () => setMobileQueue(!mobileQueue),
    search,
  };
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "prototype-root",
          palettes[palette].scheme === "dark" && "dark",
        )}
        data-variant={variant}
        data-palette={palette}
      >
        <ReceptionToolbar
          variant={variant}
          onVariant={changeVariant}
          palette={palette}
          onPalette={setPalette}
          onToggleQueue={() => setMobileQueue(!mobileQueue)}
          infoOpen={infoOpen}
          onToggleInfo={() => setInfoOpen(!infoOpen)}
          away={away}
          onToggleAway={() => setAway(!away)}
        />
        <motion.div
          className="workspace"
          key={`${variant}-${resetVersion}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {variant === "A" ? (
            <VariantA {...props} />
          ) : variant === "C" ? (
            <VariantC {...props} />
          ) : (
            <VariantE {...props} />
          )}
        </motion.div>
        <PrototypeDock
          variant={variant}
          onHelp={() => setHelpOpen(true)}
          onScenarios={() => setScenariosOpen(true)}
          draftCount={
            Object.values(inbox.drafts).filter((draft) => draft.trim()).length
          }
        />
        <AnimatePresence>
          {inbox.toast && (
            <motion.div
              key={inbox.toast}
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
            >
              <MessageCircle size={16} />
              {inbox.toast}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {helpOpen && (
            <DesignGuide
              key="guide"
              variant={variant}
              onClose={() => setHelpOpen(false)}
            />
          )}
          {scenariosOpen && (
            <ScenarioPanel
              key="scenarios"
              inbox={inbox}
              visitor={visitor}
              onSelect={select}
              onReset={reset}
              onClose={() => setScenariosOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
