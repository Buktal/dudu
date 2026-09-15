import {
  Inbox as InboxIcon,
  Keyboard,
  MessageCircle,
  Search,
  Star,
} from "lucide-react";
import { IconButton } from "./components/primitives";
import { ChatPanel } from "./features/inbox/chat-panel";
import {
  ConversationList,
  type QueueOptions,
  QueueTabs,
  QueueTools,
} from "./features/inbox/conversation-list";
import { InfoDock } from "./features/inbox/info-dock";
import type { Inbox } from "./features/inbox/use-inbox";
import type { Visitor } from "./types";

export type WorkspaceProps = {
  inbox: Inbox;
  visitor: Visitor;
  primary: Visitor;
  companion: Visitor;
  companionOpen: boolean;
  closeCompanion: () => void;
  focus: number;
  queue: Visitor[];
  options: QueueOptions;
  setOptions: (change: Partial<QueueOptions>) => void;
  select: (id: string) => void;
  parallel: (id: string) => void;
  focusPane: (slot: number) => void;
  next: (id: string) => void;
  infoOpen: boolean;
  setInfoOpen: (value: boolean) => void;
  openHelp: () => void;
  mobileQueue: boolean;
  toggleQueue: () => void;
  search: () => void;
};

export function Details(props: WorkspaceProps) {
  return (
    <InfoDock
      open={props.infoOpen}
      visitor={props.visitor}
      inbox={props.inbox}
      onClose={() => props.setInfoOpen(false)}
    />
  );
}

export function VariantA(props: WorkspaceProps) {
  const { inbox, visitor, options } = props;
  return (
    <div
      className={`classic-shell ${props.infoOpen ? "with-info" : ""} ${props.mobileQueue ? "mobile-queue-open" : ""}`}
    >
      <div className="classic-navigation">
        <nav className="app-rail" aria-label="工作台导航">
          <div className="rail-main">
            <IconButton
              icon={MessageCircle}
              label="所有会话"
              active={options.filter !== "starred"}
              onClick={() => {
                props.setOptions({ filter: "all" });
                props.toggleQueue();
              }}
            />
            <IconButton
              icon={Star}
              label="星标会话"
              active={options.filter === "starred"}
              onClick={() => {
                props.setOptions({
                  filter: options.filter === "starred" ? "all" : "starred",
                });
                if (window.innerWidth <= 760 && !props.mobileQueue)
                  props.toggleQueue();
              }}
            />
            <IconButton icon={Search} label="搜索会话" onClick={props.search} />
          </div>
          <div className="rail-bottom">
            <IconButton
              icon={Keyboard}
              label="查看快捷键"
              onClick={props.openHelp}
            />
          </div>
        </nav>
        <aside className="inbox-column">
          <header className="inbox-title">
            <div>
              <h1>消息</h1>
              <span className="title-caption">所有来访，都在这里</span>
            </div>
            <span className="inbox-mark">
              <InboxIcon size={19} />
            </span>
          </header>
          <QueueTabs
            visitors={inbox.visitors}
            value={options.filter}
            onChange={(filter) => props.setOptions({ filter })}
          />
          <QueueTools options={options} onChange={props.setOptions} />
          <div className="queue-caption">
            <span>
              {options.filter === "starred" ? "星标会话" : "我的接待"}
            </span>
            <span>{props.queue.length} 位访客</span>
          </div>
          <ConversationList
            visitors={props.queue}
            inbox={inbox}
            selectedId={visitor.id}
            onSelect={props.select}
          />
          <div className="inbox-footer">
            <span>
              <i />6 个消息来源
            </span>
          </div>
        </aside>
      </div>
      <main className="classic-chat">
        <ChatPanel
          visitor={visitor}
          inbox={inbox}
          onFocus={() => inbox.markRead(visitor.id)}
          onNext={props.next}
          onInfo={() => props.setInfoOpen(!props.infoOpen)}
        />
      </main>
      <Details {...props} />
    </div>
  );
}
