package com.dudu.duduserver.channel.xiaohongshu;

import cn.hutool.json.JSONObject;
import com.dudu.duduserver.channel.support.Errcodes;

/**
 * 小红书服务端接口响应解码（事实见 docs/research/channels/xiaohongshu.md §12.1、§12.2）：
 * 响应为 success（boolean）/msg（说明）/code（int，0 成功）三件套，成功须 success=true 且
 * code=0；发送与凭证换取共用同一份，渠道原始值透传，不各自猜错误文本。code/msg 与微信系
 * errcode/errmsg 同形，说明拼接在 Errcodes 单点。
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
        return Errcodes.code(response, KEY_CODE);
    }

    // 渠道原始说明：code + msg；两字段都缺失时如实说明响应无法识别
    static String describe(JSONObject response) {
        return Errcodes.describe(response, KEY_CODE, KEY_MSG);
    }
}
