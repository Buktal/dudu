import { describe, expect, it } from "vitest";
import { safeAssetUrl, safeExternalUrl } from "./attachment-utils";

describe("attachment URL boundary", () => {
  it("allows explicit web links and rejects executable or local-file source links", () => {
    expect(safeExternalUrl("https://example.com/order?id=7")).toBe(
      "https://example.com/order?id=7",
    );
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "file:///C:/private.txt",
      "/unknown-route",
      "https://user:password@example.com/",
    ]) {
      expect(safeExternalUrl(value)).toBeNull();
    }
  });

  it("limits data URLs to their media context and keeps readable file downloads available", () => {
    expect(safeAssetUrl("data:image/svg+xml,%3Csvg/%3E", "image")).toBe(
      "data:image/svg+xml,%3Csvg/%3E",
    );
    expect(safeAssetUrl("blob:http://localhost/image-preview", "image")).toBe(
      "blob:http://localhost/image-preview",
    );
    expect(safeAssetUrl("data:text/plain;base64,dGVzdA==", "download")).toBe(
      "data:text/plain;base64,dGVzdA==",
    );
    expect(
      safeAssetUrl("data:text/html,<script>1</script>", "download"),
    ).toBeNull();
    expect(
      safeAssetUrl("data:image/svg+xml,%3Csvg/%3E", "download"),
    ).toBeNull();
    expect(safeAssetUrl("javascript:alert(1)", "video")).toBeNull();
  });
});
