import type { CompanyProfile } from "@/api/types";
import { TextField } from "@/components/form-field";
import { FieldGroup } from "@/components/ui/field";

export const emptyProfile: CompanyProfile = {
  companyName: "",
  contactName: null,
  contactInfo: null,
  remark: null,
};
export function cleanProfile(profile: CompanyProfile): CompanyProfile {
  return {
    companyName: profile.companyName.trim(),
    contactName: profile.contactName?.trim() || null,
    contactInfo: profile.contactInfo?.trim() || null,
    remark: profile.remark?.trim() || null,
  };
}

export function ProfileFields({
  profile,
  setProfile,
  disabled,
}: {
  profile: CompanyProfile;
  setProfile: (profile: CompanyProfile) => void;
  disabled: boolean;
}) {
  return (
    <FieldGroup className="gap-5">
      <TextField
        label="企业名称"
        value={profile.companyName}
        onChange={(event) =>
          setProfile({ ...profile, companyName: event.target.value })
        }
        required
        maxLength={100}
        disabled={disabled}
        placeholder="填写企业名称"
      />
      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="联系人"
          value={profile.contactName ?? ""}
          onChange={(event) =>
            setProfile({ ...profile, contactName: event.target.value })
          }
          maxLength={100}
          disabled={disabled}
          placeholder="选填"
        />
        <TextField
          label="联系方式"
          value={profile.contactInfo ?? ""}
          onChange={(event) =>
            setProfile({ ...profile, contactInfo: event.target.value })
          }
          maxLength={200}
          disabled={disabled}
          placeholder="电话或邮箱（选填）"
        />
      </FieldGroup>
      <TextField
        label="备注"
        multiline
        value={profile.remark ?? ""}
        onChange={(event) =>
          setProfile({ ...profile, remark: event.target.value })
        }
        maxLength={1000}
        disabled={disabled}
        placeholder="补充企业信息（选填）"
      />
    </FieldGroup>
  );
}
