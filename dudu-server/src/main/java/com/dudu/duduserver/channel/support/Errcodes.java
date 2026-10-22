package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONObject;

/**
 * 接口响应错误解码的「code + msg」同形族单点：微信系三渠道（公众号 wechat-mp.md §6、
 * 企业微信 wecom.md §6/91039、小程序 wechat-mini.md §6.2）以 errcode/errmsg 固定键直接
 * 使用，飞书/小红书/QQ/钉钉旧系各自键名不同、经键参数化共用同一实现；whatsapp/meituan/
 * weibo/telegram 的错误形状是真协议差异，不在此收敛。code 缺省 0 表示成功，说明原样透出
 * 渠道原文，不各自猜错误文本。
 */
public final class Errcodes {

    private static final String KEY_ERROR_CODE = "errcode";
    private static final String KEY_ERROR_MSG = "errmsg";

    private Errcodes() {
    }

    // 响应没有 code 键时按成功处理，由调用方按自身接口语义继续判断
    public static int code(JSONObject response) {
        return code(response, KEY_ERROR_CODE);
    }

    // 键参数化版：飞书/小红书 code、QQ err_code、钉钉旧系 errcode 共用
    public static int code(JSONObject response, String codeKey) {
        return response.getInt(codeKey, 0);
    }

    // 渠道原始说明：errcode + errmsg；缺失时如实说明响应无法识别
    public static String describe(JSONObject response) {
        return describe(response, KEY_ERROR_CODE, KEY_ERROR_MSG);
    }

    // 渠道原始说明（键参数化）：两键皆缺按响应无法识别，code 缺失只透出说明（不拼 "null"）
    public static String describe(JSONObject response, String codeKey, String msgKey) {
        Integer code = response.getInt(codeKey);
        String message = response.getStr(msgKey);
        boolean missingMessage = message == null || message.isEmpty();
        if (code == null && missingMessage) {
            return "响应无法识别";
        }
        if (code == null) {
            return message;
        }
        return code + " " + (missingMessage ? "" : message);
    }
}
