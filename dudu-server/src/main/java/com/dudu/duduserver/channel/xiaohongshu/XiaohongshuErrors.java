package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;

/**
 * 小红书服务端接口响应解码（事实见 docs/research/channels/xiaohongshu.md §12.1、§12.2）：
 * 响应为 success（boolean）/msg（说明）/code（int，0 成功）三件套，成功须 success=true 且
 * code=0；发送与凭证换取共用同一份，渠道原始值透传，不各自猜错误文本。
 */
final class XiaohongshuErrors {

    private static final String KEY_SUCCESS = "success";
    private static final String KEY_MSG = "msg";
    private static final String KEY_CODE = "code";

    private XiaohongshuErrors() {
    }

    // 成功判定取两字段合取：官方口径「正确响应时 code 为 0、错误响应时非 0」
    static boolean succeeded(JSONObject response) {
        return response.getBool(KEY_SUCCESS, false) && code(response) == 0;
    }

    static int code(JSONObject response) {
        Integer code = response.getInt(KEY_CODE, 0);
        return code == null ? 0 : code;
    }

    // 渠道原始说明：code + msg；两字段都缺失时如实说明响应无法识别
    static String describe(JSONObject response) {
        Integer code = response.getInt(KEY_CODE);
        String message = response.getStr(KEY_MSG);
        if (code == null && message == null) {
            return "响应无法识别";
        }
        return code + " " + (message == null ? "" : message);
    }
}
