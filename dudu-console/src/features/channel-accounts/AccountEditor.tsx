import { useState } from "react";
import { ApiError } from "@/api/client";
import { useConsole } from "@/api/context";
import { TextField } from "@/components/form-field";
import {
  SubmitButton,
  SubmitMessage,
  useSubmit,
} from "@/components/submit-shell";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type AccountDetail,
  type ChannelDefinition,
  channelApi,
  type GroupOption,
} from "./api";
import {
  CredentialFields,
  credentialError,
  editableValues,
} from "./credentials";
export function AccountEditor({
  definitions,
  groups,
  detail,
  initialGroup,
  onClose,
  onSaved,
  onUnavailable,
}: {
  definitions: ChannelDefinition[];
  groups: GroupOption[];
  detail?: AccountDetail;
  initialGroup: string | null;
  onClose: () => void;
  onSaved: (detail: AccountDetail) => void;
  onUnavailable: () => void;
}) {
  const client = useConsole();
  const shell = useSubmit();
  const [channel, setChannel] = useState(detail?.channel ?? "");
  const [groupId, setGroupId] = useState(detail?.groupId ?? initialGroup ?? "");
  const [name, setName] = useState(detail?.accountName ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    detail?.fields ?? {},
  );
  const [clear, setClear] = useState<string[]>([]);
  const definition = definitions.find((x) => x.channel === channel);
  return (
    <Sheet open onOpenChange={shell.hold(onClose).onOpenChange}>
      <SheetContent
        showCloseButton={!shell.pending}
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>{detail ? "维护渠道账号" : "接入渠道账号"}</SheetTitle>
          <SheetDescription>
            接收参数必需；发送凭据可稍后补齐。参数齐全不代表已授权或在线。
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-6 p-6"
          onSubmit={(event) =>
            shell.submit(
              event,
              () =>
                !name.trim()
                  ? "请输入账号名称"
                  : !definition
                    ? "请选择渠道"
                    : !detail && !definition.available
                      ? definition.restriction || "该渠道当前不可接入"
                      : !groupId
                        ? "请选择用户组"
                        : credentialError(definition, values, detail),
              (signal) => {
                if (!definition) throw new Error("请选择渠道");
                return detail
                  ? channelApi.update(
                      client,
                      detail.companyChannelId,
                      {
                        accountName: name.trim(),
                        credentialChanges: {
                          set: editableValues(definition, values, detail),
                          clear,
                        },
                      },
                      signal,
                    )
                  : channelApi.create(
                      client,
                      {
                        accountName: name.trim(),
                        channel,
                        groupId,
                        fields: editableValues(definition, values),
                      },
                      signal,
                    );
              },
              {
                commit: (result) => {
                  setValues({});
                  setClear([]);
                  onSaved(result);
                },
                onError: (error) => {
                  if (error instanceof ApiError && error.code === 12100)
                    onUnavailable();
                },
              },
            )
          }
        >
          <SubmitMessage error={shell.error} />
          <FieldSet disabled={shell.pending}>
            <FieldGroup>
              <TextField
                label="账号名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
              {!detail && (
                <>
                  <label className="grid gap-2 text-sm">
                    所属用户组
                    <select
                      className="h-10 rounded-lg border bg-background px-3"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      required
                    >
                      <option value="">请选择用户组</option>
                      {groups.map((g) => (
                        <option key={g.groupId} value={g.groupId}>
                          {g.groupName} · {g.groupId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    渠道
                    <select
                      className="h-10 rounded-lg border bg-background px-3"
                      value={channel}
                      onChange={(e) => {
                        setChannel(e.target.value);
                        setValues({});
                        setClear([]);
                      }}
                      required
                    >
                      <option value="">请选择渠道</option>
                      {definitions.map((d) => (
                        <option
                          key={d.channel}
                          value={d.channel}
                          disabled={!d.available}
                        >
                          {d.name}
                          {!d.available
                            ? ` · ${d.restriction || "当前部署不支持"}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {definitions
                    .filter((d) => !d.available)
                    .map((d) => (
                      <p
                        key={d.channel}
                        className="text-sm text-muted-foreground"
                      >
                        {d.name}：{d.restriction || "当前部署不可接入"}
                      </p>
                    ))}
                </>
              )}
              {definition && (
                <>
                  {definition.restriction && (
                    <p className="text-sm text-muted-foreground">
                      {definition.restriction}
                    </p>
                  )}
                  <CredentialFields
                    definition={definition}
                    detail={detail}
                    values={values}
                    clear={clear}
                    setValues={setValues}
                    setClear={setClear}
                    disabled={shell.pending}
                  />
                  {definition.notes.map((note) => (
                    <p key={note} className="text-sm text-muted-foreground">
                      {note}
                    </p>
                  ))}
                </>
              )}
              <p className="text-sm text-muted-foreground">
                仅对同一外部账号轮换凭据；更换外部账号请新建记录。Telegram
                仅可轮换同一 Bot ID 的 token，身份由服务端校验。
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={shell.pending}
                  onClick={onClose}
                >
                  取消
                </Button>
                <SubmitButton
                  shell={shell}
                  label="保存参数"
                  pendingLabel="正在保存"
                  disabled={!definition || (!detail && !groups.length)}
                />
              </div>
            </FieldGroup>
          </FieldSet>
        </form>
      </SheetContent>
    </Sheet>
  );
}
