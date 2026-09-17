import { describe, expect, it } from "vitest";

import type { EventItem } from "./model";
import { describeEventVersion, describeTemplateVersion } from "./resolve";

const event = (id: string, revisions: number[]): EventItem => ({
  id,
  name: id,
  channelId: "douyin",
  schemaId: "dy-text",
  versions: revisions.map((revision) => ({
    revision,
    savedAt: "2026-09-12T00:00:00.000Z",
    payload: { event: "im_receive_msg", content: {} },
    expected: { status: 200, body: "", bodyMode: "contains" as const },
  })),
});

/** 模板侧只Truthy id + version：窄行（校验侧 StepTemplateRef 同形） */
const template = (id: string, version: string) => ({ id, version });

describe("describeEventVersion", () => {
  it("命中返回 ok 并带回事件与版本", () => {
    const events = [event("evt-1", [1, 2])];
    const status = describeEventVersion(events, {
      eventId: "evt-1",
      revision: 2,
    });
    expect(status.status).toBe("ok");
    if (status.status === "ok") {
      expect(status.row.id).toBe("evt-1");
      expect(status.entry.revision).toBe(2);
    }
  });

  it("事件没了返回 id-missing", () => {
    expect(
      describeEventVersion([event("evt-1", [1])], {
        eventId: "evt-gone",
        revision: 1,
      }).status,
    ).toBe("id-missing");
  });

  it("事件在但版本没了返回 version-missing 并带回行", () => {
    const status = describeEventVersion([event("evt-1", [1])], {
      eventId: "evt-1",
      revision: 9,
    });
    expect(status.status).toBe("version-missing");
    if (status.status === "version-missing") {
      expect(status.row.id).toBe("evt-1");
    }
  });
});

describe("describeTemplateVersion", () => {
  it("命中返回 ok 并带回钉住版本条目", () => {
    const status = describeTemplateVersion([template("dy-text", "2026.10")], {
      templateId: "dy-text",
      templateVersion: "2026.10",
    });
    expect(status.status).toBe("ok");
    if (status.status === "ok") {
      expect(status.entry.id).toBe("dy-text");
      expect(status.entry.version).toBe("2026.10");
    }
  });

  it("id 未注册返回 id-missing", () => {
    expect(
      describeTemplateVersion([template("dy-text", "2026.10")], {
        templateId: "dy-gone",
        templateVersion: "2026.10",
      }).status,
    ).toBe("id-missing");
  });

  it("id 在但版本更替返回 version-missing", () => {
    expect(
      describeTemplateVersion([template("dy-text", "2026.10")], {
        templateId: "dy-text",
        templateVersion: "2999.01",
      }).status,
    ).toBe("version-missing");
  });
});
