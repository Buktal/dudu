package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;
import com.dudu.duduserver.channel.support.Errcodes;

/**
 * 钉钉错误说明（事实库 §5.11）：oapi 旧系 errcode/errmsg 与新 api 系 code/message
 * 两族形状分别还原原始值，不翻译、不吞码；形状无法识别时如实说明。旧系与微信系
 * errcode/errmsg 同形，拼接在 Errcodes 单点（本侧保留 trim 习惯）。
 */
final class DingtalkErrors {

    private DingtalkErrors() {
    }

    // 旧系错误码：缺失视为 0（errcode=0 即成功语义）
    static int code(JSONObject response) {
        return Errcodes.code(response, "errcode");
    }

    // 旧系说明：errcode + errmsg；两者皆缺按响应无法识别
    static String describe(JSONObject response) {
        return Errcodes.describe(response, "errcode", "errmsg").trim();
    }

    // 新系说明：code + message
    static String describeNew(JSONObject response) {
        String code = response.getStr("code", "");
        String message = response.getStr("message", "");
        return code.isEmpty() && message.isEmpty() ? "响应无法识别" : (code + " " + message).trim();
    }
}
