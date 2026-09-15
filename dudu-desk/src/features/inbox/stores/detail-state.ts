import type { ApiFailure } from "@/lib/api-response";

export type DetailSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error: ApiFailure | null;
};

export type ProfileEdit = DetailSaveState & {
  tagsText: string;
  note: string;
  revision: number;
  savedRevision: number;
  baseVersion: number;
};

export type ProfileChanges = Partial<Pick<ProfileEdit, "tagsText" | "note">>;
