package com.dudu.duduserver.channel.meituan;

import cn.hutool.json.JSONObject;

/**
 * 美团合作中心错误响应描述（docs/research/channels/meituan.md §5.6、§6、§8 第 5 条）：
 * msg/send 响应形状未取得官方原文，按已实锤的 API 家族错误形状识别——{"data":"ng",
 * "error":{code,msg}} 与 {"code":…,"msg":…}（703 签名错、700 系统错等）任一出现返回原样
 * 描述，其余返回 null 表示未识别出错误形状（缺席即成功）。
 */
final class MeituanErrors {

    private MeituanErrors() {
    }

    // 识别到家族错误形状返回「code msg」描述，null 表示无错误形状
    static String describe(JSONObject response) {
        if (response == null) {
            return "响应无法识别";
        }
        // 形状一：{"data":"ng","error":{"code":808,"msg":"…"}}（§5.6 同意退款响应逐字）
        JSONObject error = response.getJSONObject("error");
        if ("ng".equals(response.getStr("data", "")) && error != null) {
            return join(error.get("code"), error.getStr("msg", ""));
        }
        // 形状二：顶层 code/msg（§6：code 703 签名错、700 系统错等；context7 镜像 803 示例）
        if (response.containsKey("code")) {
            Object code = response.get("code");
            String msg = response.getStr("msg", "");
            if (isFailureCode(code)) {
                return join(code, msg);
            }
        }
        return null;
    }

    // code 数值为 0 视为成功口径之外的表达缺失——非零数字或非数字码一律按失败描述
    private static boolean isFailureCode(Object code) {
        if (code instanceof Number number) {
            return number.intValue() != 0;
        }
        return true;
    }

    private static String join(Object code, String message) {
        String codeText = String.valueOf(code);
        if (message.isEmpty()) {
            return codeText;
        }
        return codeText + " " + message;
    }
}
