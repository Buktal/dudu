import { useState } from "react";
import { ResourceLibrary } from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { EntityHeader, StudioButton } from "@/components/studio-controls";
import { StudioIcon } from "@/components/studio-icon";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import type { ConnectionConfig } from "../api";
import * as actions from "../stores/connections-slice";

export function ConnectionsView() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.connections);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const channel = state.selectedChannel;
  const platform = channelById(channel);
  const saved = state.items[channel];
  const draft =
    state.drafts?.[channel] ??
    saved ??
    (channel === "douyin"
      ? actions.defaultDouyinConnection
      : actions.defaultWecomConnection);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const test = actions.selectTestState(state, channel);
  const fields =
    draft.channel === "douyin"
      ? [
          {
            key: "clientKey",
            label: "Client Key",
            note: "应用标识",
            value: draft.clientKey,
            secret: false,
          },
          {
            key: "clientSecret",
            label: "Client Secret",
            note: "用于构造平台签名",
            value: draft.clientSecret,
            secret: true,
          },
        ]
      : [
          {
            key: "corpId",
            label: "CorpID",
            note: "企业标识",
            value: draft.corpId,
            secret: false,
          },
          {
            key: "token",
            label: "Token",
            note: "回调签名 Token",
            value: draft.token,
            secret: true,
          },
          {
            key: "encodingAesKey",
            label: "EncodingAESKey",
            note: "43 位消息加解密密钥",
            value: draft.encodingAesKey,
            secret: true,
          },
          {
            key: "agentId",
            label: "AgentID",
            note: "自建应用 ID",
            value: draft.agentId,
            secret: false,
          },
        ];
  const edit = (key: string, value: string) =>
    dispatch(
      actions.setConnectionDraft({
        ...draft,
        [key]: value,
      } as ConnectionConfig),
    );
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const url = new URL(draft.url);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("回调目标须为 HTTP 或 HTTPS 地址。");
      await dispatch(actions.saveConnection(draft)).unwrap();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const matches = CHANNELS.filter((item) =>
    `${item.name} ${item.protocol} ${item.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <ResourceWorkspace
      viewId="connections"
      libraryLabel="平台列表"
      library={(close) => (
        <ResourceLibrary
          title="平台列表"
          singular="连接"
          total={CHANNELS.length}
          query={query}
          onQuery={setQuery}
          entries={matches.map((item) => ({
            id: item.id,
            name: item.name,
            channel: item.id,
            description: item.protocol,
          }))}
          selectedId={channel}
          onSelect={(id) => {
            close();
            dispatch(actions.setConnectionChannel(id as ChannelId));
            setError("");
          }}
          page={1}
          pages={1}
          filteredTotal={matches.length}
          onPage={() => {}}
        />
      )}
    >
      <EntityHeader
        name={platform?.name ?? channel}
        label="连接"
        channel={channel}
        kicker={platform?.protocol ?? ""}
        dirty={dirty}
        saved={!!saved}
        actions={
          <StudioButton
            tone={dirty ? "soft" : undefined}
            disabled={saving}
            onClick={() => void save()}
          >
            <StudioIcon name="save" />
            保存连接
          </StudioButton>
        }
      />
      <div className="editor-tabs">
        <span className="tab active">目标服务</span>
        <span className="grow" />
        <span className="pill">本地开发</span>
      </div>
      <div className="editor-scroll">
        <div className="info-line">
          <StudioIcon name="info" />
          <span>
            填写你的服务接收回调的地址。发送时使用该平台的凭据进行签名或加密。
          </span>
        </div>
        <FieldGroup className="settings-grid">
          <Field className="settings-field full-width">
            <FieldLabel htmlFor="connection-url">回调目标地址</FieldLabel>
            <Input
              id="connection-url"
              value={draft.url}
              spellCheck={false}
              onChange={(event) => edit("url", event.target.value)}
            />
            <small>该平台的事件和剧本共享这个地址，其他平台单独设置。</small>
          </Field>
          {fields.map((field) => (
            <Field
              key={`${channel}-${field.key}`}
              className={`settings-field${field.key === "encodingAesKey" ? " full-width" : ""}`}
            >
              <FieldLabel htmlFor={`connection-${field.key}`}>
                {field.label}
              </FieldLabel>
              <Input
                id={`connection-${field.key}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                value={field.value}
                onChange={(event) => edit(field.key, event.target.value)}
              />
              <small>{field.note}</small>
            </Field>
          ))}
        </FieldGroup>
        <div className="connection-line">
          <StudioIcon name="info" />
          <span>
            {channel === "douyin"
              ? "抖音 dop · JSON 回调"
              : "企业微信自建应用 · XML 回调"}
          </span>
        </div>
        <section className="connection-test">
          <h3 className="section-title">连接测试</h3>
          <p className="raw-note">
            {channel === "douyin"
              ? "发送 verify_webhook challenge，检查目标服务是否原样回显。"
              : "发送加密 echostr，检查目标服务是否正确解密并回显。"}
          </p>
          <div className="row">
            <StudioButton
              disabled={test.status === "testing"}
              onClick={() => void dispatch(actions.testConnection(draft))}
            >
              <StudioIcon
                name={test.status === "testing" ? "refresh" : "link"}
                className={test.status === "testing" ? "spin" : undefined}
              />
              {test.status === "testing" ? "正在测试…" : "测试连接"}
            </StudioButton>
            {test.status === "success" ? (
              <span className="pill success">连接正常</span>
            ) : test.status === "failed" ? (
              <span className="pill error">测试未通过</span>
            ) : null}
          </div>
          {test.message ? (
            <p className="raw-note" role="status">
              {test.message}
            </p>
          ) : null}
        </section>
        {error ? (
          <p role="alert" className="modal-inline-error">
            {error}
          </p>
        ) : null}
      </div>
    </ResourceWorkspace>
  );
}
