import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api";
import { resolveEditorFields } from "../definitions/resolve";
import { schemaById } from "../schemas";
import { selectDraft } from "../selectors";
import {
  applyFieldDefinitions,
  definitionsReducer,
  fetchFieldDefinitions,
  selectFieldDefinitions,
  selectSchemaUserDefinition,
} from "./definitions-slice";
import { eventsReducer, setDraftField, startDraft } from "./events-slice";

vi.mock("../api", () => ({
  loadEvents: vi.fn(),
  saveEvent: vi.fn(),
  deleteEventById: vi.fn(),
  loadDefinitions: vi.fn(),
  saveDefinition: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

// 用户字段定义已拆独立顶层 slice：表单元数据即时生效的用例同时挂双 reducer
function makeStore() {
  return configureStore({
    reducer: { events: eventsReducer, definitions: definitionsReducer },
  });
}

describe("字段说明：用户定义装载与应用（#22）", () => {
  it("初始无定义；装载后 loaded 置位，bySchemaId 为空文档", async () => {
    const store = makeStore();
    expect(selectFieldDefinitions(store.getState().definitions)).toEqual({
      loaded: false,
      bySchemaId: {},
    });

    apiMock.loadDefinitions.mockResolvedValue({ schemas: {} });
    await store.dispatch(fetchFieldDefinitions());
    expect(selectFieldDefinitions(store.getState().definitions)).toEqual({
      loaded: true,
      bySchemaId: {},
    });
  });

  it("应用说明按 schemaId 落库，未知字段补录后转正为正常表单字段", async () => {
    const store = makeStore();
    apiMock.saveDefinition.mockImplementation(
      async (schemaId: string, definition: api.StoredSchemaDefinition) => ({
        schemas: { [schemaId]: definition },
      }),
    );

    // 草稿里先有一个未知字段：此时还是「待补充说明」的未知回退
    store.dispatch(startDraft({ name: "带未知字段", schemaId: "dy-text" }));
    store.dispatch(setDraftField({ path: "content.guest_id", value: "g-001" }));
    const before = resolveEditorFields(
      schemaById("dy-text"),
      selectSchemaUserDefinition(store.getState().definitions, "dy-text")
        ?.fields,
      selectDraft(store.getState().events)?.payload ?? {},
    );
    expect(
      before.find((field) => field.path === "content.guest_id"),
    ).toMatchObject({ unknown: true, group: "其他参数" });

    // 字典「应用说明」：把补录说明写成用户定义
    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.guest_id",
            title: "访客 ID",
            type: "string",
            group: "用户与身份",
            description: "补录的第三方访客标识。",
            required: true,
          },
        ],
      }),
    );

    const userDef = selectSchemaUserDefinition(
      store.getState().definitions,
      "dy-text",
    );
    expect(userDef).toMatchObject({ schemaId: "dy-text", version: "2026.09" });

    // 定义应用后表单元数据即时生效：不再是 unknown、按其分组归位、显示自定义标题
    const after = resolveEditorFields(
      schemaById("dy-text"),
      selectSchemaUserDefinition(store.getState().definitions, "dy-text")
        ?.fields,
      selectDraft(store.getState().events)?.payload ?? {},
    );
    const promoted = after.find((field) => field.path === "content.guest_id");
    expect(promoted).toMatchObject({
      title: "访客 ID",
      group: "用户与身份",
      description: "补录的第三方访客标识。",
      unknown: false,
      value: "g-001",
    });
  });

  it("再次应用说明按 schemaId 整体覆写旧定义", async () => {
    const store = makeStore();
    let saved: api.DefinitionsDoc = { schemas: {} };
    apiMock.saveDefinition.mockImplementation(
      async (schemaId: string, definition: api.StoredSchemaDefinition) => {
        saved = { schemas: { ...saved.schemas, [schemaId]: definition } };
        return saved;
      },
    );

    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.text",
            title: "旧标题",
            type: "string",
            group: "消息内容",
            description: "旧说明。",
          },
        ],
      }),
    );
    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.text",
            title: "新标题",
            type: "string",
            group: "消息内容",
            description: "新说明。",
          },
        ],
      }),
    );
    const fields = selectSchemaUserDefinition(
      store.getState().definitions,
      "dy-text",
    )?.fields;
    expect(fields).toHaveLength(1);
    expect(fields?.[0]).toMatchObject({ title: "新标题" });
  });
});
