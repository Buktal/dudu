import { useState } from "react";
import { EntityHeader } from "@/components/entity-header";
import { Notice } from "@/components/notice";
import { ResourceLibrary } from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { StudioIcon } from "@/components/studio-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <Button
            variant={dirty ? "secondary" : "outline"}
            disabled={saving}
            onClick={() => void save()}
          >
            <StudioIcon name="save" data-icon="inline-start" />
            保存连接
          </Button>
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 lg:px-6">
        <span className="flex items-center gap-2">目标服务</span>
        <span className="min-w-0 flex-1" />
        <Badge variant="secondary">本地开发</Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
        <Notice className="mb-4">
          <StudioIcon name="info" />
          <span>
            填写你的服务接收回调的地址。发送时使用该平台的凭据进行签名或加密。
          </span>
        </Notice>
        <FieldGroup className="grid grid-cols-1 gap-5 @xl/workspace:grid-cols-2">
          <Field className="min-w-0 col-span-full">
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
              className={`settings-field${field.key === "encodingAesKey" ? "col-span-full" : ""}`}
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
        <div className="flex flex-wrap items-center gap-3">
          <StudioIcon name="info" />
          <span>
            {channel === "douyin"
              ? "抖音 dop · JSON 回调"
              : "企业微信自建应用 · XML 回调"}
          </span>
        </div>
        <section className="mt-8 flex flex-col gap-3">
          <h3 className="text-sm font-semibold">连接测试</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {channel === "douyin"
              ? "发送 verify_webhook challenge，检查目标服务是否原样回显。"
              : "发送加密 echostr，检查目标服务是否正确解密并回显。"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={test.status === "testing"}
              onClick={() => void dispatch(actions.testConnection(draft))}
              variant="outline"
            >
              <StudioIcon
                name={test.status === "testing" ? "refresh" : "link"}
                className={
                  test.status === "testing"
                    ? "motion-safe:animate-spin"
                    : undefined
                }
                data-icon="inline-start"
              />
              {test.status === "testing" ? "正在测试…" : "测试连接"}
            </Button>
            {test.status === "success" ? (
              <Badge variant="secondary">连接正常</Badge>
            ) : test.status === "failed" ? (
              <Badge variant="destructive">测试未通过</Badge>
            ) : null}
          </div>
          {test.message ? (
            <p
              className="mt-3 text-sm leading-relaxed text-muted-foreground"
              role="status"
            >
              {test.message}
            </p>
          ) : null}
        </section>
        {error ? (
          <Notice role="alert" className="mb-4" variant="destructive">
            {error}
          </Notice>
        ) : null}
      </div>
    </ResourceWorkspace>
  );
}
