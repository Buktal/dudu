import {
  Clock3,
  FilePenLine,
  Info,
  MapPin,
  PanelRightClose,
  Plus,
  Tag,
  X,
} from "lucide-react";
import { useState } from "react";
import { Avatar, SourceTag } from "../../components/identity";
import { SoftReveal } from "../../components/motion";
import { IconButton } from "../../components/primitives";
import type { Visitor } from "../../types";
import type { Inbox } from "./use-inbox";

export function VisitorInfo({
  visitor,
  inbox,
  onClose,
}: {
  visitor: Visitor;
  inbox: Inbox;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState("");
  function addTag(event: React.FormEvent) {
    event.preventDefault();
    const value = tag.trim().slice(0, 14);
    if (value && !visitor.tags.includes(value))
      inbox.patch(visitor.id, { tags: [...visitor.tags, value] });
    setTag("");
    setAdding(false);
  }
  return (
    <aside className="visitor-info" aria-label={`${visitor.name} 的访客信息`}>
      <header className="info-header">
        <h2>访客信息</h2>
        <IconButton
          icon={PanelRightClose}
          label="收起访客信息"
          onClick={onClose}
        />
      </header>
      <SoftReveal className="info-scroll">
        <div className="visitor-profile">
          <Avatar visitor={visitor} size="large" badge={false} />
          <h3>{visitor.name}</h3>
          <SourceTag channel={visitor.channel} full />
          <span className="profile-account">{visitor.account}</span>
        </div>
        <div className="info-section">
          <h4>
            <Info size={14} />
            基本信息
          </h4>
          <dl>
            <div>
              <dt>昵称</dt>
              <dd>{visitor.name}</dd>
            </div>
            <div>
              <dt>渠道账号</dt>
              <dd>{visitor.account}</dd>
            </div>
            <div>
              <dt>联系电话</dt>
              <dd className={!visitor.phone ? "unknown" : ""}>
                {visitor.phone ?? "渠道未提供"}
              </dd>
            </div>
            <div>
              <dt>地区</dt>
              <dd className={!visitor.location ? "unknown" : ""}>
                {visitor.location ?? "渠道未提供"}
              </dd>
            </div>
          </dl>
          <div className="identity-line">
            <span>来源身份</span>
            <code>{visitor.handle}</code>
          </div>
        </div>
        <div className="info-section">
          <h4>
            <Tag size={14} />
            访客标签
            <IconButton
              icon={Plus}
              label="添加访客标签"
              onClick={() => setAdding(!adding)}
            />
          </h4>
          <div className="visitor-tags">
            {visitor.tags.map((item) => (
              <span key={item}>
                {item}
                <button
                  type="button"
                  aria-label={`移除标签 ${item}`}
                  onClick={() =>
                    inbox.patch(visitor.id, {
                      tags: visitor.tags.filter((value) => value !== item),
                    })
                  }
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {!visitor.tags.length && <span className="no-tags">暂无标签</span>}
          </div>
          {adding && (
            <form className="tag-form" onSubmit={addTag}>
              <input
                aria-label="新标签名称"
                placeholder="输入标签，回车添加"
                maxLength={14}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
              <button type="submit">添加</button>
            </form>
          )}
        </div>
        <div className="info-section note-section">
          <h4>
            <FilePenLine size={14} />
            接待备注<span className="private-note-label">仅坐席可见</span>
          </h4>
          <textarea
            aria-label={`${visitor.name} 的接待备注`}
            placeholder="记下这位访客的偏好…"
            value={visitor.note}
            onChange={(event) =>
              inbox.patch(visitor.id, { note: event.target.value })
            }
            onBlur={() => {
              if (visitor.note) inbox.notify("接待备注已保留在本次演示中");
            }}
          />
        </div>
        <div className="info-section visit-context">
          <h4>
            <Clock3 size={14} />
            会话线索
          </h4>
          <div>
            <Clock3 size={13} />
            <p>
              <span>首次来访</span>
              <strong>{visitor.firstVisit}</strong>
            </p>
          </div>
          <div>
            <MapPin size={13} />
            <p>
              <span>本次咨询来源</span>
              <strong>{visitor.source}</strong>
            </p>
          </div>
        </div>
        <p className="info-footnote">
          资料来自当前渠道与接待记录。
          <br />
          未提供的信息保持留白。
        </p>
      </SoftReveal>
    </aside>
  );
}
