package com.dudu.duduserver.channel.weibo;

import cn.hutool.json.JSONObject;

/**
 * 微博开放平台错误响应描述：官方客服消息与 msget 页均未给错误示例，按微博开放平台通用
 * error_code/error 键原样透传，无法识别时如实说明，不编造错误码。
 */
final class WeiboErrors {

    private WeiboErrors() {
    }

    static String describe(JSONObject response) {
        String code = response.getStr("error_code", "");
        String message = response.getStr("error", "");
        if (code.isEmpty() && message.isEmpty()) {
            return "响应无法识别";
        }
        if (code.isEmpty()) {
            return message;
        }
        return message.isEmpty() ? code : code + " " + message;
    }
}
