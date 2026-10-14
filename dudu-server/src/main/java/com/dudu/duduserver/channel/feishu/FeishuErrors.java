package com.dudu.duduserver.channel.feishu;

import cn.hutool.json.JSONObject;

/**
 * 飞书接口响应错误解码（事实见 docs/research/channels/feishu.md §5.10、§5.11）：JSON
 * 响应以 code=0 表示成功、msg 原样透出渠道说明；换取凭据与消息发送共用同一份，
 * 不各自猜错误文本。
 */
final class FeishuErrors {

    private static final String KEY_CODE = "code";
    private static final String KEY_MSG = "msg";

    private FeishuErrors() {
    }

    // 响应没有 code 时按成功处理，由调用方按自身接口语义继续判断
    static int code(JSONObject response) {
        Integer code = response.getInt(KEY_CODE, 0);
        return code == null ? 0 : code;
    }

    // 渠道原始说明：code + msg；两者都缺时如实说明响应无法识别
    static String describe(JSONObject response) {
        Integer code = response.getInt(KEY_CODE);
        String message = response.getStr(KEY_MSG);
        if (code == null && message == null) {
            return "响应无法识别";
        }
        return code + " " + (message == null ? "" : message);
    }
}
