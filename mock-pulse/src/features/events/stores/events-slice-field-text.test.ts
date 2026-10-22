import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";

import { getAt } from "../payload";
import { selectDraft } from "../selectors";
import {
  editFieldText,
  eventsReducer,
  saveEvent,
  setDraftField,
  startDraft,
  toggleSenderSync,
} from "./events-slice";

function makeStore() {
  return configureStore({ reducer: { events: eventsReducer } });
}

describe("editFieldText：文本转换与 senderSync 联动", () => {
  it("number：合法写入数值；非数字/空白落字段错误并阻止保存", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "数字", schemaId: "dy-text" }));
    store.dispatch(
      editFieldText({
        path: "content.conversation_type",
        type: "number",
        text: "2",
      }),
    );
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.conversation_type",
      ),
    ).toBe(2);
    expect(
      store.getState().events.fieldInputs?.["content.conversation_type"],
    ).toEqual({ text: "2" });

    store.dispatch(
      editFieldText({
        path: "content.conversation_type",
        type: "number",
        text: "abc",
      }),
    );
    expect(
      store.getState().events.fieldInputs?.["content.conversation_type"],
    ).toEqual({ text: "abc", error: "请输入有效数字。" });
    // 非法时载荷保留旧值，保存被字段错误阻止
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.conversation_type",
      ),
    ).toBe(2);
    await expect(store.dispatch(saveEvent()).unwrap()).rejects.toMatchObject({
      message: expect.stringContaining("请先修正参数"),
    });

    store.dispatch(
      editFieldText({
        path: "content.conversation_type",
        type: "number",
        text: "  ",
      }),
    );
    expect(
      store.getState().events.fieldInputs?.["content.conversation_type"]?.error,
    ).toBe("请输入有效数字。");
  });

  it("json / boolean：JSON 解析落值，非法解析落原文错误", () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "布尔", schemaId: "dy-text" }));
    store.dispatch(
      editFieldText({ path: "content.custom", type: "boolean", text: "true" }),
    );
    expect(
      getAt(selectDraft(store.getState().events)?.payload, "content.custom"),
    ).toBe(true);
    store.dispatch(
      editFieldText({ path: "content.custom", type: "json", text: '{"k":1}' }),
    );
    expect(
      getAt(selectDraft(store.getState().events)?.payload, "content.custom"),
    ).toEqual({ k: 1 });
    store.dispatch(
      editFieldText({ path: "content.custom", type: "json", text: "{" }),
    );
    expect(
      store.getState().events.fieldInputs?.["content.custom"]?.error,
    ).toBeTruthy();
  });

  it("XML 模板：对象/null 值拒绝并保留原文案，文本放行", () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));
    store.dispatch(
      editFieldText({ path: "Content", type: "json", text: '{"a":1}' }),
    );
    expect(store.getState().events.fieldInputs?.Content?.error).toBe(
      "XML 元素的值必须是文本。",
    );
    store.dispatch(
      editFieldText({ path: "Content", type: "text", text: "你好" }),
    );
    expect(store.getState().events.fieldInputs?.Content).toEqual({
      text: "你好",
    });
    expect(
      getAt(selectDraft(store.getState().events)?.payload, "Content"),
    ).toBe("你好");
  });

  it("senderSync 联动：编辑 from_user_id 清掉 open_id 的未修正输入并对齐", () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "联动", schemaId: "dy-text" }));
    store.dispatch(toggleSenderSync());
    store.dispatch(
      editFieldText({
        path: "content.user_infos[0].open_id",
        type: "json",
        text: "{",
      }),
    );
    expect(
      store.getState().events.fieldInputs?.["content.user_infos[0].open_id"]
        ?.error,
    ).toBeTruthy();
    store.dispatch(
      editFieldText({ path: "from_user_id", type: "text", text: "new-sender" }),
    );
    const state = store.getState().events;
    expect(
      state.fieldInputs?.["content.user_infos[0].open_id"],
    ).toBeUndefined();
    expect(getAt(state.draft?.payload, "from_user_id")).toBe("new-sender");
    expect(getAt(state.draft?.payload, "content.user_infos[0].open_id")).toBe(
      "new-sender",
    );
  });

  it("senderSync 收敛：toggle 与表单修改同样作废被同步覆盖的身份输入（其余路径保留）", () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "开关", schemaId: "dy-text" }));
    // 两个身份字段各留一条未应用输入：同步只覆盖 user_infos[0]（schema
    // 推导的写入路径），[1] 非同步目标、输入必须保留
    store.dispatch(
      editFieldText({
        path: "content.user_infos[0].open_id",
        type: "text",
        text: "待作废",
      }),
    );
    store.dispatch(
      editFieldText({
        path: "content.user_infos[1].open_id",
        type: "text",
        text: "接收方",
      }),
    );
    store.dispatch(toggleSenderSync());
    const toggled = store.getState().events;
    expect(
      toggled.fieldInputs?.["content.user_infos[0].open_id"],
    ).toBeUndefined();
    expect(toggled.fieldInputs?.["content.user_infos[1].open_id"]).toEqual({
      text: "接收方",
    });

    // 表单路径修改 from_user_id 与编辑器文本输入同语义：被覆盖的身份输入作废
    store.dispatch(
      editFieldText({
        path: "content.user_infos[0].open_id",
        type: "text",
        text: "再次待作废",
      }),
    );
    store.dispatch(
      setDraftField({ path: "from_user_id", value: "form-sender" }),
    );
    const after = store.getState().events;
    expect(
      after.fieldInputs?.["content.user_infos[0].open_id"],
    ).toBeUndefined();
    expect(getAt(after.draft?.payload, "content.user_infos[0].open_id")).toBe(
      "form-sender",
    );
    expect(after.fieldInputs?.["content.user_infos[1].open_id"]).toEqual({
      text: "接收方",
    });
  });
});
