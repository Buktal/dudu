import { ChevronDown, Languages, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useConsole } from "@/api/context";
import { useMutation } from "@/api/use-mutation";
import { useQuery } from "@/api/use-query";
import { DetailPane } from "@/components/detail-pane";
import { EmptyState } from "@/components/feedback";
import { SelectField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { type Settings, translationApi } from "./api";
import { ServiceCard } from "./service-card";

function Editor({ initial }: { initial: Settings }) {
  const client = useConsole();
  const [settings, setSettings] = useState(initial);
  const [providerId, setProviderId] = useState(
    initial.providers.find((item) => !item.unavailableReason)?.id ?? "",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<{ id: string; text: string | null } | null>(
    null,
  );
  const shell = useSubmit();
  const testing = useMutation();
  const busy = shell.pending || testing.pending;
  const defaultService = settings.services.find(
    (service) => service.id === settings.defaultService,
  );
  const unavailable = settings.providers.filter(
    (provider) => provider.unavailableReason,
  );
  const update = (id: string, patch: Partial<Settings["services"][number]>) => {
    setNotice(null);
    if (test?.id === id) {
      setTest(null);
      testing.setError(null);
    }
    setSettings((value) => ({
      ...value,
      services: value.services.map((service) =>
        service.id === id ? { ...service, ...patch } : service,
      ),
    }));
  };
  const add = () => {
    const provider = settings.providers.find((item) => item.id === providerId);
    if (!provider) return;
    const service = {
      id: crypto.randomUUID(),
      name: provider.name,
      provider: provider.id,
      endpoint: provider.endpoint,
      values: Object.fromEntries(
        provider.fields.map((field) => [field.key, ""]),
      ),
    };
    setSettings({
      ...settings,
      services: [...settings.services, service],
      defaultService: settings.defaultService ?? service.id,
    });
    setNotice(null);
  };
  return (
    <form
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) =>
        shell.submit(
          event,
          () => null,
          (signal) => translationApi.save(client, settings, signal),
          {
            commit: (value) => {
              setSettings(value);
              setNotice("翻译服务配置已保存");
            },
          },
        )
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">翻译服务</h2>
          <p className="text-sm text-muted-foreground">
            接入企业自己的翻译服务，让坐席用熟悉的语言阅读消息。
          </p>
        </div>
      </header>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label="翻译服务管理"
        >
          <Card size="sm">
            <CardHeader>
              <CardTitle>默认服务</CardTitle>
              <CardDescription>
                所有坐席的手动与自动翻译均使用此服务。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-4">
                <SelectField
                  label="选择默认服务"
                  value={settings.defaultService ?? "none"}
                  disabled={busy}
                  onChange={(value) => {
                    setSettings({
                      ...settings,
                      defaultService: value === "none" ? null : value,
                    });
                    setNotice(null);
                  }}
                  options={[
                    { value: "none", label: "不启用翻译" },
                    ...settings.services.map((service) => ({
                      value: service.id,
                      label: service.name,
                    })),
                  ]}
                />
                <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span
                    className="mt-1 h-8 w-0.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {defaultService?.name || "尚未启用"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {defaultService
                        ? "坐席可在工作台设置阅读语言"
                        : "添加服务后，选择一个作为企业默认"}
                    </p>
                  </div>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>添加服务</CardTitle>
              <CardDescription>常规翻译与模型翻译均可接入。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-3">
                <SelectField
                  label="服务提供方"
                  value={providerId}
                  disabled={busy}
                  onChange={setProviderId}
                  options={settings.providers
                    .filter((provider) => !provider.unavailableReason)
                    .map((provider) => ({
                      value: provider.id,
                      label: `${provider.name} · ${provider.kind === "model" ? "模型" : "常规"}`,
                    }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={add}
                >
                  <Plus data-icon="inline-start" />
                  添加配置
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            译文仅供坐席阅读，发送给来访用户的内容保持原样。
          </p>
        </aside>
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-label="已添加的翻译服务"
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-medium">服务配置</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {settings.services.length} 个服务
            </span>
          </div>
          {settings.services.length === 0 && (
            <Card size="sm">
              <CardContent>
                <EmptyState
                  title="添加第一个翻译服务"
                  description="选择服务提供方并添加配置，再填写企业自己的接口与凭据。"
                  icon={Languages}
                />
              </CardContent>
            </Card>
          )}
          {settings.services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              provider={settings.providers.find(
                (item) => item.id === service.provider,
              )}
              active={settings.defaultService === service.id}
              busy={busy}
              testing={testing.pending && test?.id === service.id}
              error={test?.id === service.id ? testing.error : null}
              result={test?.id === service.id ? test.text : null}
              onChange={(patch) => update(service.id, patch)}
              onTest={() => {
                setTest({ id: service.id, text: null });
                void testing.run(
                  (signal) => translationApi.test(client, service, signal),
                  {
                    commit: (result) =>
                      setTest({ id: service.id, text: result.text }),
                  },
                );
              }}
              onRemove={() => {
                setSettings({
                  ...settings,
                  defaultService:
                    settings.defaultService === service.id
                      ? null
                      : settings.defaultService,
                  services: settings.services.filter(
                    (item) => item.id !== service.id,
                  ),
                });
                setNotice(null);
              }}
            />
          ))}
          {unavailable.length > 0 && (
            <details className="group rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>
                  暂不可用的服务{" "}
                  <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                    {unavailable.length}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <Separator />
              <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
                {unavailable.map((provider) => (
                  <div key={provider.id} className="min-w-0">
                    <dt className="text-sm font-medium">{provider.name}</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {provider.unavailableReason}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </section>
      </div>
      <footer className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border bg-card/95 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">变更在保存后生效</p>
          <p className="mt-1 text-xs text-muted-foreground">
            新增或修改服务后，建议先测试连接。
          </p>
          <div className="mt-2 empty:hidden">
            <SubmitMessage error={shell.error} notice={notice} />
          </div>
        </div>
        <SubmitButton
          shell={shell}
          label="保存全部配置"
          pendingLabel="正在保存…"
          disabled={testing.pending}
        />
      </footer>
    </form>
  );
}

export function TranslationPage() {
  const client = useConsole();
  const load = useCallback(
    (signal: AbortSignal) => translationApi.get(client, signal),
    [client],
  );
  const query = useQuery(load);
  return (
    <DetailPane {...query}>
      {query.data && <Editor key={query.data.revision} initial={query.data} />}
    </DetailPane>
  );
}
