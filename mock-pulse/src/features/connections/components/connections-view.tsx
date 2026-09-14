import {
  CheckCircle2Icon,
  KeyRoundIcon,
  LinkIcon,
  SaveIcon,
  ServerIcon,
} from "lucide-react";
import { useState } from "react";
import { EntityHeader } from "@/components/entity-header";
import { Notice } from "@/components/notice";
import { ResourceLibrary } from "@/components/resource-library";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import type { ConnectionConfig, DouyinSystem } from "../api";
import * as actions from "../stores/connections-slice";
import { ConnectionFields } from "./connection-fields";

/** 抖音握手文案按推送体系呈现（事实库 §3.1/§3.4：四套体系握手形态不同） */
function douyinTestNote(system: DouyinSystem): string {
  switch (system) {
    case "mini_game":
      return "发送 verify_request（x-signature 五头），检查服务是否验签通过并回 HTTP 200。";
    case "isv":
      return "按授权推送形态发送 TOKEN 重签信封，检查服务是否直接返回 success（不带引号）。";
    default:
      return "发送 challenge，检查服务是否原样返回验证内容。";
  }
}

export function ConnectionsView() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.connections);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [saving, setSaving] = useState(false);
  const [changedSinceTest, setChangedSinceTest] = useState<
    Partial<Record<ChannelId, boolean>>
  >({});
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
  const testing = test.status === "testing";
  const staleTest = changedSinceTest[channel];
  const edit = (key: string, value: string) => {
    setError("");
    if (key === "url") setUrlError("");
    setChangedSinceTest((value) => ({ ...value, [channel]: true }));
    dispatch(
      actions.setConnectionDraft({
        ...draft,
        [key]: value,
      } as ConnectionConfig),
    );
  };
  const validateUrl = () => {
    try {
      const url = new URL(draft.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      setUrlError("");
      return true;
    } catch {
      setUrlError(
        "请输入完整的 HTTP 或 HTTPS 地址，例如 http://127.0.0.1:8080/webhooks/douyin。",
      );
      return false;
    }
  };
  const save = async () => {
    if (!validateUrl()) return;
    setSaving(true);
    setError("");
    try {
      await dispatch(actions.saveConnection(draft)).unwrap();
      toast.add({
        title: "连接已保存",
        description: `${platform?.name}的事件将使用这份配置。`,
        type: "success",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  // 连接 = 渠道适配器（握手/直发/回执投影）；未实现渠道的适配器未接入，
  // 平台列表只列已实现渠道（其余渠道在事件/剧本等选择器中照常可见）
  const connectable = CHANNELS.filter((item) => item.implemented);
  const matches = connectable.filter((item) =>
    `${item.name} ${item.protocol} ${item.id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <ResourceWorkspace
      viewId="connections"
      libraryLabel="平台列表"
      library={(close) => (
        <ResourceLibrary
          title="平台列表"
          singular="连接"
          total={connectable.length}
          query={query}
          onQuery={setQuery}
          entries={matches.map((item) => ({
            id: item.id,
            name: item.name,
            channel: item.id,
            description: `${actions.isConnectionReady(state.items[item.id]) ? "已配置" : "待配置"} · ${item.protocol}`,
          }))}
          selectedId={channel}
          onSelect={(id) => {
            close();
            dispatch(actions.setConnectionChannel(id as ChannelId));
            setError("");
            setUrlError("");
          }}
          page={1}
          pages={1}
          filteredTotal={matches.length}
          onPage={() => {}}
        />
      )}
    >
      <EntityHeader
        name={`${platform?.name ?? channel}连接`}
        label="连接"
        channel={channel}
        kicker={platform?.protocol ?? ""}
        dirty={dirty}
        saved={!!saved}
        actions={
          <Button disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {saving ? "正在保存…" : "保存连接"}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto border-t bg-background/50 p-5 lg:p-7">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {error ? (
            <Notice role="alert" variant="destructive">
              {error}
            </Notice>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerIcon />
                回调目标
              </CardTitle>
              <CardDescription>
                填写本地服务接收平台回调的地址。
              </CardDescription>
              <CardAction>
                <Badge variant="outline">
                  {channel === "douyin" ? "JSON" : "XML"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!urlError}>
                  <FieldLabel htmlFor="connection-url">回调地址</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <LinkIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="connection-url"
                      value={draft.url}
                      spellCheck={false}
                      aria-invalid={!!urlError}
                      aria-describedby="connection-url-hint"
                      onChange={(event) => edit("url", event.target.value)}
                    />
                  </InputGroup>
                  {urlError ? (
                    <FieldError id="connection-url-hint">{urlError}</FieldError>
                  ) : (
                    <FieldDescription id="connection-url-hint">
                      {platform?.name}的事件和剧本共用此地址，各平台独立配置。
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRoundIcon />
                签名与加密
              </CardTitle>
              <CardDescription>
                与接收服务的配置保持一致，用于模拟平台的真实请求。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectionFields draft={draft} onEdit={edit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>验证连接</CardTitle>
              <CardDescription>
                {channel === "douyin"
                  ? douyinTestNote(
                      draft.channel === "douyin" ? draft.system : "dop",
                    )
                  : "发送加密 echostr，检查服务是否正确解密并回显。"}
              </CardDescription>
              <CardAction>
                <Button
                  variant="outline"
                  disabled={testing}
                  onClick={() => {
                    if (!validateUrl()) return;
                    setChangedSinceTest((value) => ({
                      ...value,
                      [channel]: false,
                    }));
                    void dispatch(actions.testConnection(draft));
                  }}
                >
                  {testing ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <LinkIcon data-icon="inline-start" />
                  )}
                  {testing ? "正在测试…" : "测试连接"}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {test.message && !staleTest ? (
                <Notice
                  role="status"
                  variant={test.status === "failed" ? "destructive" : "default"}
                >
                  {test.status === "success" ? (
                    <CheckCircle2Icon className="size-4 text-success" />
                  ) : null}
                  <span>{test.message}</span>
                </Notice>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {test.message && staleTest
                    ? "配置已修改，请重新测试。"
                    : "测试使用当前表单的配置；保存后，事件发送才会使用新配置。"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ResourceWorkspace>
  );
}
