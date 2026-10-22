package com.dudu.duduserver.channel.qq;

import cn.hutool.json.JSONObject;
import com.dudu.duduserver.channel.support.Errcodes;

/**
 * QQ OpenAPI 业务响应错误解码（事实见 docs/research/channels/qq.md §6）：err_code 缺省
 * 0 表示成功，message 原样透出渠道说明，trace_id 供链路追踪（官方 api-call-guide「链路
 * 追踪」节）；发送侧共用同一份，不各自猜错误文本。err_code/message 与微信系 errcode/
 * errmsg 同形，基础拼接在 Errcodes 单点，本类只补 trace_id 追踪后缀。取凭证失败响应的
 * 字段名是 code 而非 err_code（access-token 页），由 QqAccessTokenClient 自行判定。
 */
final class QqErrors {

    private static final String KEY_ERROR_CODE = "err_code";
    private static final String KEY_MESSAGE = "message";
    private static final String KEY_TRACE_ID = "trace_id";

    private QqErrors() {
    }

    // 响应没有 err_code 时按成功处理，由调用方按自身接口语义继续判断
    static int code(JSONObject response) {
        return Errcodes.code(response, KEY_ERROR_CODE);
    }

    // 渠道原始说明：err_code + message + trace_id；缺失时如实说明响应无法识别
    static String describe(JSONObject response) {
        String base = Errcodes.describe(response, KEY_ERROR_CODE, KEY_MESSAGE);
        String traceId = response.getStr(KEY_TRACE_ID);
        return traceId == null || traceId.isEmpty() ? base : base + " trace_id=" + traceId;
    }
}
