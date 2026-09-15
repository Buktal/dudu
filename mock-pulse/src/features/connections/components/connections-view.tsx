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
import type { ConnectionConfig } from "../api";
import * as actions from "../stores/connections-slice";
import { ConnectionFields } from "./connection-fields";
import {
  alipayTestNote,
  dingtalkTestNote,
  douyinTestNote,
  elemeTestNote,
  feishuTestNote,
  jingdongTestNote,
  kuaishouTestNote,
  meituanTestNote,
  pinduoduoTestNote,
  qqTestNote,
  taobaoTestNote,
  wechatMiniTestNote,
  wechatMpTestNote,
  wecomTestNote,
  weiboTestNote,
  whatsappTestNote,
  xiaohongshuTestNote,
} from "./test-notes";

/** 回包信封形态标注：企微自建应用 XML、智能机器人 JSON、抖音/飞书/钉钉/QQ/微博/小红书/快手/淘宝/京东/饿了么 JSON、美团/支付宝表单、公众号 XML */
function wireBadgeLabel(
  channel: ChannelId,
  draft: ConnectionConfig,
): "JSON" | "XML" | "表单" {
  if (
    channel === "douyin" ||
    channel === "feishu" ||
    channel === "dingtalk" ||
    channel === "qq" ||
    channel === "weibo" ||
    channel === "xiaohongshu" ||
    channel === "kuaishou" ||
    channel === "taobao" ||
    channel === "jingdong" ||
    channel === "pinduoduo" ||
    channel === "eleme" ||
    channel === "whatsapp"
  ) {
    return "JSON";
  }
  if (channel === "meituan" || channel === "alipay") {
    return "表单";
  }
  if (channel === "wecom" && draft.channel === "wecom") {
    return draft.system === "aibot" ? "JSON" : "XML";
  }
  return "XML";
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
      : channel === "wechat-mp"
        ? actions.defaultWechatMpConnection
        : channel === "wechat-mini"
          ? actions.defaultWechatMiniConnection
          : channel === "feishu"
            ? actions.defaultFeishuConnection
            : channel === "dingtalk"
              ? actions.defaultDingtalkConnection
              : channel === "qq"
                ? actions.defaultQqConnection
                : channel === "weibo"
                  ? actions.defaultWeiboConnection
                  : channel === "xiaohongshu"
                    ? actions.defaultXiaohongshuConnection
                    : channel === "kuaishou"
                      ? actions.defaultKuaishouConnection
                      : channel === "taobao"
                        ? actions.defaultTaobaoConnection
                        : channel === "jingdong"
                          ? actions.defaultJingdongConnection
                          : channel === "pinduoduo"
                            ? actions.defaultPinduoduoConnection
                            : channel === "meituan"
                              ? actions.defaultMeituanConnection
                              : channel === "eleme"
                                ? actions.defaultElemeConnection
                                : channel === "alipay"
                                  ? actions.defaultAlipayConnection
                                  : channel === "whatsapp"
                                    ? actions.defaultWhatsappConnection
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
                  {wireBadgeLabel(channel, draft)}
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
                  : channel === "wechat-mp"
                    ? wechatMpTestNote(
                        draft.channel === "wechat-mp" ? draft.mode : "plain",
                      )
                    : channel === "wechat-mini"
                      ? wechatMiniTestNote(
                          draft.channel === "wechat-mini"
                            ? draft.mode
                            : "plain",
                        )
                      : channel === "feishu"
                        ? feishuTestNote(draft)
                        : channel === "dingtalk"
                          ? dingtalkTestNote(
                              draft.channel === "dingtalk"
                                ? draft.system
                                : "http_crypto",
                            )
                          : channel === "qq"
                            ? qqTestNote()
                            : channel === "weibo"
                              ? weiboTestNote()
                              : channel === "xiaohongshu"
                                ? xiaohongshuTestNote(
                                    draft.channel === "xiaohongshu"
                                      ? draft.system
                                      : "miniapp",
                                  )
                                : channel === "kuaishou"
                                  ? kuaishouTestNote()
                                  : channel === "taobao"
                                    ? taobaoTestNote()
                                    : channel === "jingdong"
                                      ? jingdongTestNote()
                                      : channel === "pinduoduo"
                                        ? pinduoduoTestNote()
                                        : channel === "meituan"
                                          ? meituanTestNote()
                                          : channel === "eleme"
                                            ? elemeTestNote()
                                            : channel === "alipay"
                                              ? alipayTestNote()
                                              : channel === "whatsapp"
                                                ? whatsappTestNote()
                                                : wecomTestNote(
                                                    draft.channel === "wecom"
                                                      ? draft.system
                                                      : "agent",
                                                  )}
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
