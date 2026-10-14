import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleHelp,
  FlaskConical,
  LockKeyhole,
  MessageCirclePlus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { softSpring } from "./components/motion";
import { Button, IconButton, Modal } from "./components/primitives";
import type { Inbox } from "./features/inbox/use-inbox";
import type { Variant, Visitor } from "./types";
import { variantKeys, variants } from "./variant-registry";

export function PrototypeDock({
  variant,
  onVariant,
  onHelp,
  onScenarios,
  draftCount,
}: {
  variant: Variant;
  onVariant: (variant: Variant) => void;
  onHelp: () => void;
  onScenarios: () => void;
  draftCount: number;
}) {
  const all = variantKeys;
  function cycle(offset: number) {
    onVariant(all[(all.indexOf(variant) + offset + all.length) % all.length]);
  }
  return (
    <footer className="prototype-footer">
      <span className="prototype-caption">
        <span />
        DUDU DESK <b>·</b> 交互探索
      </span>
      <div className="prototype-dock">
        <span className="dock-label">方案</span>
        <IconButton
          icon={ArrowLeft}
          label="上一版原型"
          onClick={() => cycle(-1)}
        />
        <LayoutGroup id="prototype-variants">
          <fieldset className="variant-options" aria-label="选择原型方案">
            {all.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={variant === key}
                onClick={() => onVariant(key)}
              >
                {variant === key && (
                  <motion.span
                    className="variant-selection"
                    layoutId="variant-selection"
                    transition={softSpring}
                  />
                )}
                <span className="variant-key">{variants[key].number}</span>
                {variants[key].name}
              </button>
            ))}
          </fieldset>
        </LayoutGroup>
        <IconButton
          icon={ArrowRight}
          label="下一版原型"
          onClick={() => cycle(1)}
        />
        <span className="dock-divider" />
        <button
          type="button"
          className="dock-action"
          aria-label="体验场景"
          onClick={onScenarios}
        >
          <FlaskConical size={14} />
          <span>体验场景</span>
        </button>
        <button
          type="button"
          className="dock-help"
          aria-label="查看原型设计说明"
          onClick={onHelp}
        >
          <CircleHelp size={17} />
        </button>
      </div>
      <span className="prototype-state" aria-live="polite">
        {draftCount ? `${draftCount} 位访客有草稿` : "演示数据 · 可自由操作"}
      </span>
    </footer>
  );
}

export function DesignGuide({
  variant,
  onClose,
}: {
  variant: Variant;
  onClose: () => void;
}) {
  return (
    <Modal title="四种接待方式，继续探索" onClose={onClose} wide>
      <p className="guide-lead">
        经典界面 +
        快速响应模式。同一批访客，比较四种接待方式；每位访客的草稿随切换保留。
      </p>
      <div className="guide-directions">
        {variantKeys.map((key) => (
          <article key={key} data-selected={key === variant}>
            <span className="guide-letter">方案 {variants[key].number}</span>
            <h3>
              {variants[key].name}
              <small className="direction-subtitle">
                {variants[key].description}
              </small>
            </h3>
            <p>{variants[key].angle}</p>
            <p>{variants[key].benefit}</p>
            <div>{variants[key].question}</div>
          </article>
        ))}
      </div>
      <div className="guide-shared">
        <BookOpen size={18} />
        <p>
          <strong>每一版共同遵守</strong>
          来访用户是一种统一的对象；来源徽标帮助识别渠道，气泡不随渠道变样。每段会话独立保存草稿，新消息不抢焦点。未提供的资料、未确认的投递结果不编造。
        </p>
      </div>
      <div className="shortcuts">
        <span>
          <kbd>Enter</kbd>发送消息
        </span>
        <span>
          <kbd>Shift Enter</kbd>换行
        </span>
        <span>
          <kbd>Ctrl Enter</kbd>发送后接待下一位
        </span>
        <span>
          <kbd>Ctrl K</kbd>搜索会话
        </span>
        <span>
          <kbd>Alt 1 / 2</kbd>切换并行窗口
        </span>
        <span>
          <kbd>← / →</kbd>切换方案（输入时除外）
        </span>
      </div>
      <p className="dialog-caption">
        仅探索消息收发与访客信息。所有消息均为模拟；未连接真实渠道。这里展示的是设计假设，效率需要通过实际试用判断。
      </p>
    </Modal>
  );
}

export function ScenarioPanel({
  inbox,
  visitor,
  onSelect,
  onReset,
  onClose,
}: {
  inbox: Inbox;
  visitor: Visitor;
  onSelect: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const other = inbox.visitors.find(
    (item) => item.id !== visitor.id && item.status !== "ended",
  );
  const scenarios = [
    {
      icon: MessageCirclePlus,
      title: "另一位访客发来消息",
      text: "观察未读提醒，当前输入与草稿应保持原位。",
      action: () => {
        if (other)
          inbox.receive(other.id, "我补充一下，想要米白色的。还有现货吗？");
        onClose();
      },
    },
    {
      icon: Send,
      title: `让 ${visitor.name} 的下一条发送失败`,
      text: "发送一条消息，再点击气泡旁的重试。",
      action: () => {
        inbox.setFailFor(visitor.id);
        if (!inbox.drafts[visitor.id])
          inbox.updateDraft(visitor.id, "你好，我正在帮你确认，请稍等一下～");
        inbox.notify(`已设置：给 ${visitor.name} 的下一条消息会发送失败`);
        onClose();
      },
    },
    {
      icon: LockKeyhole,
      title: "看看回复受限的会话",
      text: "Evan 的 WhatsApp 会话已超过自由回复窗口。",
      action: () => {
        inbox.patch("evan", { replyOpen: false, status: "needs-reply" });
        onSelect("evan");
        onClose();
      },
    },
    {
      icon: MessageCirclePlus,
      title: "当前访客再次发来消息",
      text: "模拟新消息到达；受限会话重新可以自由回复。",
      action: () => {
        inbox.receive(visitor.id, "你好，我回来了，可以继续帮我看一下吗？");
        onClose();
      },
    },
  ];
  return (
    <Modal title="动手试一试" onClose={onClose}>
      <p className="guide-lead">
        当前回复对象：<strong>{visitor.name}</strong>
        <br />
        可以先输入半句话，再触发新消息或切换方案。
      </p>
      <div className="scenario-list">
        {scenarios.map((scenario) => (
          <button type="button" key={scenario.title} onClick={scenario.action}>
            <scenario.icon size={20} />
            <span>
              <strong>{scenario.title}</strong>
              <small>{scenario.text}</small>
            </span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <div className="scenario-footer">
        <Button
          variant="outline"
          onClick={() => {
            onReset();
            onClose();
          }}
        >
          <RotateCcw data-icon="inline-start" />
          恢复初始演示
        </Button>
        <Button variant="ghost" onClick={onClose}>
          <X data-icon="inline-start" />
          回到工作台
        </Button>
      </div>
    </Modal>
  );
}
