import type { ProfileField, VisitorIdentity, VisitorProfile } from "./types";

export function profileFieldText(field: ProfileField): string {
  if (field.state === "available") return field.value;
  return field.state === "not-provided" ? "渠道未提供" : "内容为空";
}

/** Copy the channel-provided details, keeping missing and empty values distinct. */
export function formatChannelProfile(
  identity: VisitorIdentity,
  fields: VisitorProfile["fields"],
): string {
  return [
    "渠道资料",
    `渠道：${identity.channelName}`,
    `渠道账号：${identity.accountName}`,
    ...fields.map(({ label, value }) => `${label}：${profileFieldText(value)}`),
    `来源身份：${identity.externalUserId}`,
  ].join("\n");
}
