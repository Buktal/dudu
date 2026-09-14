import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("抖音服务商推送模板", () => {
  it("加密信封黄金载荷逐字（§4.3：{Nonce, TimeStamp, Encrypt, MsgSignature}）", () => {
    const golden = {
      Nonce: "4464221",
      TimeStamp: "1535551395",
      Encrypt: "Encrypt xxxx",
      MsgSignature: "ba394c04acece6c2c0edee058c5dddf82474b8ee",
    };
    expect(schemaById("dy-isv-ticket").payload).toEqual(golden);
    expect(schemaById("dy-isv-authorized").payload).toEqual(golden);
    // 官方键序逐字：Nonce → TimeStamp → Encrypt → MsgSignature
    expect(Object.keys(schemaById("dy-isv-ticket").payload)).toEqual([
      "Nonce",
      "TimeStamp",
      "Encrypt",
      "MsgSignature",
    ]);
  });

  it("服务商事件无 dop 信封字段，事件名族齐备", () => {
    expect(schemaById("dy-isv-ticket").eventName).toBe("component_ticket");
    expect(schemaById("dy-isv-authorized").eventName).toBe("authorized");
    expect(schemaById("dy-isv-ticket").payload.event).toBeUndefined();
  });

  it("期望回执 = 服务商真实语义：HTTP 200 且必须直接返回 success（不带引号）", () => {
    for (const id of ["dy-isv-ticket", "dy-isv-authorized"]) {
      expect(schemaById(id).expected).toEqual({
        status: 200,
        body: "success",
        bodyMode: "equals",
      });
    }
  });
});
