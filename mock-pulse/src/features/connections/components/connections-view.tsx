import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNELS, type ChannelId, channelById } from "@/lib/channels";
import { cn } from "@/lib/utils";
// 仅类型导入：feature → store.ts 保持运行时单向（store.ts 运行时依赖 feature reducer）
import type { AppDispatch, RootState } from "@/store";

import type { DouyinConnectionConfig, WecomConnectionConfig } from "../api";
import {
  defaultDouyinConnection,
  defaultWecomConnection,
  fetchConnections,
  saveConnection,
  selectConnection,
  selectTestState,
  type TestState,
  testConnection,
} from "../stores/connections-slice";

const DOUYIN = "douyin" as const;
const WECOM = "wecom" as const;

function isValidTargetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ChannelList({
  selected,
  onSelect,
}: {
  selected: ChannelId;
  onSelect: (channel: ChannelId) => void;
}) {
  return (
    <aside className="flex w-56 flex-none flex-col border-r border-border bg-muted/40">
      <p className="px-4 pt-5 pb-2 text-[10px] font-medium text-muted-foreground">
        平台列表
      </p>
      <div className="flex flex-col gap-2 px-3">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            aria-pressed={selected === channel.id}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              selected === channel.id
                ? "border-primary/30 bg-secondary text-secondary-foreground"
                : "border-border bg-card hover:bg-accent",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {channel.name}
              </span>
              {channel.implemented ? (
                <CheckCircle2 className="size-3.5 text-success" aria-hidden />
              ) : (
                <CircleDashed
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
              )}
            </span>
            <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
              {channel.protocol}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

/** 测试连接结果横幅：成功青绿 / 失败红，均带人类可读原因 */
function TestBanner({ test }: { test: TestState }) {
  if (test.status !== "success" && test.status !== "failed") {
    return null;
  }
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs",
        test.status === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {test.status === "success" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <div>
        <p className="font-semibold">
          {test.status === "success" ? "连接成功" : "连接失败"}
        </p>
        <p className="mt-0.5 leading-relaxed">{test.message}</p>
      </div>
    </div>
  );
}

/** 保存 + 一键测试操作行（握手期间禁用测试按钮） */
function FormActions({
  test,
  onSave,
  onTest,
}: {
  test: TestState;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" onClick={onSave}>
        保存连接
      </Button>
      <Button size="sm" onClick={onTest} disabled={test.status === "testing"}>
        {test.status === "testing" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        {test.status === "testing" ? "正在握手…" : "测试连接"}
      </Button>
    </div>
  );
}

function DouyinForm() {
  const dispatch = useDispatch<AppDispatch>();
  // 从未保存过连接时回退到默认占位值（列表里无 douyin 条目不算已配置）
  const config =
    useSelector((state: RootState) =>
      selectConnection(state.connections, DOUYIN),
    ) ?? defaultDouyinConnection;
  const test = useSelector((state: RootState) =>
    selectTestState(state.connections),
  );
  const [draft, setDraft] = useState<DouyinConnectionConfig>(config);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const update = (patch: Partial<DouyinConnectionConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError("");
  };

  const validate = (needsSecret: boolean): boolean => {
    if (!isValidTargetUrl(draft.url)) {
      setFormError("目标地址需要以 http:// 或 https:// 开头。");
      return false;
    }
    if (needsSecret && draft.clientSecret.length === 0) {
      setFormError("测试连接需要填写 Client Secret 用于构造签名。");
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (!validate(false)) return;
    await dispatch(saveConnection(draft));
  };

  const onTest = async () => {
    if (!validate(true)) return;
    await dispatch(testConnection(draft));
  };

  const channel = channelById(DOUYIN);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-7">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {channel?.protocol}
          </Badge>
          <span className="text-[11px] text-muted-foreground">本地开发</span>
        </div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          抖音连接
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          填写你的服务接收回调的地址。保存写入本地文件，重启后仍在；测试连接按官方
          verify_webhook 协议校验 challenge 回显。
        </p>
      </header>

      <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="connection-url">回调目标地址</Label>
          <Input
            id="connection-url"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.url}
            onChange={(event) => update({ url: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            该平台的事件与剧本共享这个地址，其他平台单独设置。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="connection-client-key">Client Key</Label>
          <Input
            id="connection-client-key"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.clientKey}
            onChange={(event) => update({ clientKey: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">应用标识</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="connection-client-secret">Client Secret</Label>
          <Input
            id="connection-client-secret"
            type="password"
            className="font-mono text-xs"
            autoComplete="off"
            value={draft.clientSecret}
            onChange={(event) => update({ clientSecret: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">用于构造平台签名</p>
        </div>
      </div>

      <FormActions
        test={test}
        onSave={() => void onSave()}
        onTest={() => void onTest()}
      />

      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <TestBanner test={test} />

      <p className="border-t border-border pt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
        X-Douyin-Signature = sha1hex(client_secret + body)
      </p>
    </div>
  );
}

function WecomForm() {
  const dispatch = useDispatch<AppDispatch>();
  const config =
    useSelector((state: RootState) =>
      selectConnection(state.connections, WECOM),
    ) ?? defaultWecomConnection;
  const test = useSelector((state: RootState) =>
    selectTestState(state.connections),
  );
  const [draft, setDraft] = useState<WecomConnectionConfig>(config);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const update = (patch: Partial<WecomConnectionConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError("");
  };

  const validate = (needsCrypto: boolean): boolean => {
    if (!isValidTargetUrl(draft.url)) {
      setFormError("目标地址需要以 http:// 或 https:// 开头。");
      return false;
    }
    if (needsCrypto) {
      const missing = (
        [
          ["CorpID", draft.corpId],
          ["Token", draft.token],
          ["EncodingAESKey", draft.encodingAesKey],
        ] as const
      ).filter(([, value]) => value.length === 0);
      if (missing.length > 0) {
        setFormError(
          `测试连接需要填写 ${missing.map(([name]) => name).join("、")} 用于 AES 加密与签名。`,
        );
        return false;
      }
    }
    return true;
  };

  const onSave = async () => {
    if (!validate(false)) return;
    await dispatch(saveConnection(draft));
  };

  const onTest = async () => {
    if (!validate(true)) return;
    await dispatch(testConnection(draft));
  };

  const channel = channelById(WECOM);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8 py-7">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {channel?.protocol}
          </Badge>
          <span className="text-[11px] text-muted-foreground">本地开发</span>
        </div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          企业微信连接
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          填写自建应用的回调配置。保存写入本地文件，重启后仍在；测试连接按官方
          GET echostr 协议校验：随机明文 AES-256-CBC 加密签名后请求，期望 1
          秒内原样回显解密明文。
        </p>
      </header>

      <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="wecom-url">回调目标地址</Label>
          <Input
            id="wecom-url"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.url}
            onChange={(event) => update({ url: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            该平台的事件与剧本共享这个地址，其他平台单独设置。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wecom-corp-id">CorpID</Label>
          <Input
            id="wecom-corp-id"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.corpId}
            onChange={(event) => update({ corpId: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            企业 ID，明文结构中的 receiveid
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wecom-token">Token</Label>
          <Input
            id="wecom-token"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.token}
            onChange={(event) => update({ token: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            回调配置 Token，参与签名校验
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wecom-aes-key">EncodingAESKey</Label>
          <Input
            id="wecom-aes-key"
            type="password"
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
            value={draft.encodingAesKey}
            onChange={(event) => update({ encodingAesKey: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            43 位消息加解密密钥（AES-256-CBC 派生源）
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wecom-agent-id">AgentID</Label>
          <Input
            id="wecom-agent-id"
            className="font-mono text-xs"
            spellCheck={false}
            value={draft.agentId}
            onChange={(event) => update({ agentId: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            应用 AgentID（握手不校验，后续发送使用）
          </p>
        </div>
      </div>

      <FormActions
        test={test}
        onSave={() => void onSave()}
        onTest={() => void onTest()}
      />

      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
        >
          {formError}
        </p>
      ) : null}

      <TestBanner test={test} />

      <p className="border-t border-border pt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
        msg_signature = sha1hex(sort(token, timestamp, nonce, echostr)) ·
        echostr = base64(AES-256-CBC(rand16 + len + msg + corpid))
      </p>
    </div>
  );
}

export function ConnectionsView() {
  const dispatch = useDispatch<AppDispatch>();
  const [selected, setSelected] = useState<ChannelId>(DOUYIN);

  useEffect(() => {
    dispatch(fetchConnections());
  }, [dispatch]);

  return (
    <div className="flex min-h-0 flex-1">
      <ChannelList selected={selected} onSelect={setSelected} />
      <div className="min-w-0 flex-1 overflow-y-auto bg-card">
        {selected === DOUYIN ? <DouyinForm /> : <WecomForm />}
      </div>
    </div>
  );
}
