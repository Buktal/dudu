package com.dudu.duduserver.channel.wecom;

import cn.hutool.json.JSONObject;

/**
 * 企业微信接口响应错误解码（事实见 docs/research/channels/wecom.md §6/91039）：errcode
 * 缺省 0 表示成功，errmsg 原样透出渠道说明；发送与素材读取共用同一份，不各自猜错误文本。
 */
final class WecomErrors {

    private static final String KEY_ERROR_CODE = "errcode";
    private static final String KEY_ERROR_MSG = "errmsg";

    private WecomErrors() {
    }

    // 响应没有 errcode 时按成功处理，由调用方按自身接口语义继续判断
    static int code(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE, 0);
        return code == null ? 0 : code;
    }

    // 渠道原始说明：errcode + errmsg；缺失时如实说明响应无法识别
    static String describe(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE);
        String message = response.getStr(KEY_ERROR_MSG);
        if (code == null && message == null) {
            return "响应无法识别";
        }
        return code + " " + (message == null ? "" : message);
    }
}
