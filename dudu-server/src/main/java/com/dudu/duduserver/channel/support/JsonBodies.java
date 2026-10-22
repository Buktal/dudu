package com.dudu.duduserver.channel.support;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONException;
import cn.hutool.json.JSONObject;

/**
 * 渠道 JSON 报文共用判定与字段取值：跳过空白后以首字节是否 {@code {} 区分 JSON 报文
 * （错误报文或视频下载地址等）与二进制素材体；嵌套字段取值把 hutool 的类型不符异常
 * 统一翻译为参数错误，供各渠道协议与素材读取共用。
 */
public final class JsonBodies {

    private JsonBodies() {
    }

    public static boolean isJson(byte[] body) {
        for (byte value : body) {
            if (Character.isWhitespace(value)) {
                continue;
            }
            return value == '{';
        }
        return false;
    }

    // 字符串重载：与字节口径一致（首个非空白字符是 '{'），入参须非 null
    public static boolean isJson(String body) {
        for (int index = 0; index < body.length(); index++) {
            char value = body.charAt(index);
            if (Character.isWhitespace(value)) {
                continue;
            }
            return value == '{';
        }
        return false;
    }

    // hutool 对无法转为对象的值（如字符串、数组取对象）抛 JSONException 或 ClassCastException，
    // 统一转参数错误由调用方按 400 应答，而不是作为未知异常按 500 处理
    public static JSONObject objectField(JSONObject source, String key, String context) {
        try {
            return source.getJSONObject(key);
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException(context + "字段类型不符：" + key, e);
        }
    }

    // hutool 对无法转为数组的值（如对象、字符串取数组）抛 JSONException 或 ClassCastException，
    // 统一转参数错误由调用方按 400 应答，而不是作为未知异常按 500 处理
    public static JSONArray arrayField(JSONObject source, String key, String context) {
        try {
            return source.getJSONArray(key);
        } catch (JSONException | ClassCastException e) {
            throw new IllegalArgumentException(context + "字段类型不符：" + key, e);
        }
    }
}
