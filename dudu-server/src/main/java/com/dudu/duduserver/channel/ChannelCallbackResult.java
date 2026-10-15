package com.dudu.duduserver.channel;

/**
 * 渠道回调处理结果：HTTP 状态与响应体按渠道协议原样返回——GET 验证成功回显 echostr，
 * POST 成功回 success；拒绝与不支持不使用 R 包装，也不伪装成成功。
 */
public record ChannelCallbackResult(int status, String body) {

    public static ChannelCallbackResult echo(String echostr) {
        return new ChannelCallbackResult(200, echostr);
    }

    public static ChannelCallbackResult success() {
        return new ChannelCallbackResult(200, "success");
    }

    public static ChannelCallbackResult rejected() {
        return new ChannelCallbackResult(403, "");
    }

    public static ChannelCallbackResult badRequest() {
        return new ChannelCallbackResult(400, "");
    }

    public static ChannelCallbackResult notFound() {
        return new ChannelCallbackResult(404, "");
    }

    public static ChannelCallbackResult unsupported() {
        return new ChannelCallbackResult(501, "");
    }

    // 落库未确认的暂时性故障：渠道按 at-least-once 重推，重推由入站幂等判定收敛
    public static ChannelCallbackResult serverError() {
        return new ChannelCallbackResult(500, "");
    }
}
