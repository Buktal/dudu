package com.dudu.duduserver.channel.dingtalk;

import cn.hutool.json.JSONObject;

/**
 * 钉钉错误说明（事实库 §5.11）：oapi 旧系 errcode/errmsg 与新 api 系 code/message
 * 两族形状分别还原原始值，不翻译、不吞码；形状无法识别时如实说明。
 */
final class DingtalkErrors {

    private DingtalkErrors() {
    }

    // 旧系错误码：缺失视为 0（errcode=0 即成功语义）
    static int code(JSONObject response) {
        return response.getInt("errcode", 0);
    }

    // 旧系说明：errcode + errmsg；两者皆缺按响应无法识别
    static String describe(JSONObject response) {
        Integer errcode = response.getInt("errcode");
        String errmsg = response.getStr("errmsg", "");
        if (errcode == null && errmsg.isEmpty()) {
            return "响应无法识别";
        }
        return (errcode + " " + errmsg).trim();
    }

    // 新系说明：code + message
    static String describeNew(JSONObject response) {
        String code = response.getStr("code", "");
        String message = response.getStr("message", "");
        return code.isEmpty() && message.isEmpty() ? "响应无法识别" : (code + " " + message).trim();
    }
}
