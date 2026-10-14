package com.dudu.duduserver.channel.whatsapp;

import cn.hutool.json.JSONObject;

/**
 * WhatsApp Graph API 错误解码（事实见 docs/research/channels/whatsapp.md §5.6/发送）：
 * 失败响应形如 {"error":{message,type,code,error_data{details},...}}，HTTP 状态非 2xx；
 * code 与 message 原样透出渠道说明，error_data.details 为面向开发者的人读细节。
 * 发送与媒体读取共用同一份，不各自猜错误文本。
 */
final class WhatsappErrors {

    private static final String KEY_ERROR = "error";
    private static final String KEY_CODE = "code";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_ERROR_DATA = "error_data";
    private static final String KEY_DETAILS = "details";

    private WhatsappErrors() {
    }

    // 渠道失败体是否可识别：有 error 对象即按渠道错误描述
    static boolean isChannelError(JSONObject response) {
        return response != null && response.getJSONObject(KEY_ERROR) != null;
    }

    // 渠道原始说明：code + message + error_data.details；字段缺失如实省略
    static String describe(JSONObject response) {
        JSONObject error = response.getJSONObject(KEY_ERROR);
        Integer code = error.getInt(KEY_CODE);
        String message = error.getStr(KEY_MESSAGE);
        StringBuilder base = new StringBuilder();
        if (code != null) {
            base.append(code).append(' ');
        }
        base.append(message == null ? "" : message);
        JSONObject errorData = error.getJSONObject(KEY_ERROR_DATA);
        String details = errorData == null ? null : errorData.getStr(KEY_DETAILS);
        if (details != null && !details.isEmpty()) {
            base.append(' ').append(details);
        }
        return base.toString();
    }
}
