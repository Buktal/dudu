import { Pin, Plus, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Button, Modal } from "../components/primitives";
import { ChatPanel } from "../features/inbox/chat-panel";
import {
  ConversationList,
  QueueTabs,
  QueueTools,
} from "../features/inbox/conversation-list";
import { Details, type WorkspaceProps } from "../variants";

export function VariantC(props: WorkspaceProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div
      className={`parallel-shell ${props.infoOpen ? "with-info" : ""} ${props.mobileQueue ? "mobile-queue-open" : ""}`}
    >
      <div className="parallel-workspace">
        <aside className="parallel-queue">
          <header>
            <h2>我的会话</h2>
            <span>{props.queue.length}</span>
          </header>
          <QueueTabs
            visitors={props.inbox.visitors}
            value={props.options.filter}
            onChange={(filter) => props.setOptions({ filter })}
          />
          <QueueTools options={props.options} onChange={props.setOptions} />
          <ConversationList
            visitors={props.queue}
            inbox={props.inbox}
            selectedId={props.visitor.id}
            onSelect={props.select}
            onParallel={props.parallel}
            compact
          />
          <p className="parallel-queue-tip">
            <Pin size={13} />
            点击会话切换主窗 · 并排按钮固定右窗
          </p>
        </aside>
        <main className="parallel-stage">
          <div className="parallel-stage-header">
            <span>
              <i />
              当前回复：<strong>{props.visitor.name}</strong>
            </span>
            <div className="parallel-window-actions">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setPickerOpen(true)}
              >
                <Plus data-icon="inline-start" />
                {props.companionOpen ? "更换固定访客" : "添加并排对话"}
              </Button>
              {props.companionOpen && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={props.closeCompanion}
                >
                  <X data-icon="inline-start" />
                  收起第二窗
                </Button>
              )}
            </div>
          </div>
          <p className="parallel-rule">
            <Pin size={13} />
            {props.companionOpen
              ? "左窗跟随会话列表，右窗由你固定。等一位回复时，可以继续另一段对话。"
              : "当前使用一个窗口。需要同时跟进另一位访客时，再添加并排对话。"}
          </p>
          {props.companionOpen && (
            <fieldset className="compact-pane-tabs" aria-label="选择并行窗口">
              <button
                type="button"
                aria-pressed={props.focus === 0}
                onClick={() => props.focusPane(0)}
              >
                主接待 · {props.primary.name}
              </button>
              <button
                type="button"
                aria-pressed={props.focus === 1}
                onClick={() => props.focusPane(1)}
              >
                固定 · {props.companion.name}
              </button>
            </fieldset>
          )}
          <div
            className={`parallel-panes focus-slot-${props.focus} ${!props.companionOpen ? "single-pane" : ""}`}
          >
            <AnimatePresence initial={false}>
              <ChatPanel
                key="primary-pane"
                visitor={props.primary}
                inbox={props.inbox}
                mode="parallel"
                paneLabel="主接待 · 跟随列表"
                focused={props.focus === 0}
                onFocus={() => props.focusPane(0)}
                onNext={props.next}
                onInfo={() => props.setInfoOpen(true)}
              />
              {props.companionOpen && (
                <ChatPanel
                  key="companion-pane"
                  visitor={props.companion}
                  inbox={props.inbox}
                  mode="parallel"
                  paneLabel="固定接待 · 手动选择"
                  focused={props.focus === 1}
                  onFocus={() => props.focusPane(1)}
                  onNext={props.next}
                  onInfo={() => props.setInfoOpen(true)}
                />
              )}
            </AnimatePresence>
          </div>
        </main>
        <Details {...props} />
      </div>
      <AnimatePresence>
        {pickerOpen && (
          <Modal
            title="选择固定在右侧的访客"
            onClose={() => setPickerOpen(false)}
          >
            <p className="guide-lead">
              这位访客会留在右窗；切换左侧会话时，右窗保持原位。
            </p>
            <div className="parallel-picker">
              <ConversationList
                visitors={props.inbox.visitors.filter(
                  (visitor) =>
                    visitor.id !== props.primary.id &&
                    visitor.status !== "ended",
                )}
                inbox={props.inbox}
                selectedId={props.companionOpen ? props.companion.id : ""}
                onSelect={(id) => {
                  props.parallel(id);
                  setPickerOpen(false);
                }}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
