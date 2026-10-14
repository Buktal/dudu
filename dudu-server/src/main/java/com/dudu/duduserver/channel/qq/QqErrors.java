package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONObject;

/**
 * QQ OpenAPI 业务响应错误解码（事实见 docs/research/channels/qq.md §6）：err_code 缺省
 * 0 表示成功，message 原样透出渠道说明，trace_id 供链路追踪（官方 api-call-guide「链路
 * 追踪」节）；发送侧共用同一份，不各自猜错误文本。取凭证失败响应的字段名是 code 而非
 * err_code（access-token 页），由 QqAccessTokenClient 自行判定。
 */
final class QqErrors {

    private static final String KEY_ERROR_CODE = "err_code";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_TRACE_ID = "trace_id";

    private QqErrors() {
    }

    // 响应没有 err_code 时按成功处理，由调用方按自身接口语义继续判断
    static int code(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE, 0);
        return code == null ? 0 : code;
    }

    // 渠道原始说明：err_code + message + trace_id；缺失时如实说明响应无法识别
    static String describe(JSONObject response) {
        Integer code = response.getInt(KEY_ERROR_CODE);
        String message = response.getStr(KEY_MESSAGE);
        if (code == null && message == null) {
            return "响应无法识别";
        }
        String base = code + " " + (message == null ? "" : message);
        String traceId = response.getStr(KEY_TRACE_ID);
        return traceId == null || traceId.isEmpty() ? base : base + " trace_id=" + traceId;
    }
}
