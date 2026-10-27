package com.dudu.duduserver.channel.meituan;

import com.dudu.duduserver.channel.ChannelCallbackResult;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.ChannelReceiveResult;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 美团回调协议（事实见 docs/research/channels/meituan.md §3、§4.1、§5、§8）：推送为普通
 * POST 表单参数（非 JSON、未排序），签名 = MD5(请求 url + ? + 全参数除 sig 按参数名字母序
 * k=v & 连接 + app_secret) 32 位小写——待签串中的请求 url 为 scheme://host/path 全路径
 * （§8 第 1 条两源互证），中文保持原文不单独转码，无值参数也参与拼接；推送值需解码 2 次
 * （容器一次 + 适配器一次）。判型按字段存在性：biz_type 家族为 IM（单聊落访客消息、其余只
 * 应答），order_id 为订单推送、op_type 为门店推送，均只应答不落访客数据。
 */
@Component
public class MeituanProtocol {

    // 签名参数名（§4.1）：参与传输但不参与待签串
    private static final String PARAM_SIG = "sig";

    // 判型键（§5.4 逐字）：IM 聊天类型；订单/门店表单不解析内容只应答
    private static final String PARAM_BIZ_TYPE = "biz_type";

    // IM 单聊字段（§5.4 字段表）：biz_type 固定 1，app_poi_code 与 push_content 必填
    private static final String BIZ_TYPE_IM_CHAT = "1";
    private static final String PARAM_APP_POI_CODE = "app_poi_code";
    private static final String PARAM_PUSH_CONTENT = "push_content";

    // 应答口径（§5.2 逐字）：订单/门店类小写 ok 2 秒内，IM 类大写 OK 4 秒内
    private static final ChannelCallbackResult EVENT_ACK = new ChannelCallbackResult(200, "{\"data\":\"ok\"}");
    private static final ChannelCallbackResult IM_ACK = new ChannelCallbackResult(200, "{\"data\":\"OK\"}");

    /**
     * 签名：全参数（sig 除外）按参数名字母序 k=v & 连接后接 url 与 secret 求 MD5 小写；
     * 参数名为 ASCII，Java 字符序与官方字节序一致。发送侧与验签侧共用同一套拼串规则。
     */
    public String sign(String url, Map<String, String> params, String appSecret) {
        StringBuilder toSign = new StringBuilder(url).append('?');
        TreeMap<String, String> sorted = new TreeMap<>(params);
        sorted.remove(PARAM_SIG);
        boolean first = true;
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (!first) {
                toSign.append('&');
            }
            toSign.append(entry.getKey()).append('=').append(entry.getValue());
            first = false;
        }
        return Digests.md5Hex(toSign.append(appSecret).toString());
    }

    /**
     * 验签：重算签名与表单携带的 sig 比对；sig 缺失按校验失败处理。
     */
    public boolean verify(String url, Map<String, String> params, String appSecret) {
        String sig = params.get(PARAM_SIG);
        if (sig == null || sig.isEmpty()) {
            return false;
        }
        return Digests.constantTimeEquals(sign(url, params, appSecret), sig);
    }

    /**
     * 合并回调表单（官方「解码 2 次」§3.1）：query 值容器已解码一次，这里补第二次；
     * body 原始串按 x-www-form-urlencoded 拆对后两次解码（网关以非标准内容类型直发
     * body 时容器不解析）；query 同名键优先。畸形 % 序列保留已解码值，不为假想的
     * 乱码形态拒绝整单推送。
     */
    public Map<String, String> paramsOf(Map<String, String> query, String body) {
        Map<String, String> params = new LinkedHashMap<>();
        if (query != null) {
            query.forEach((key, value) -> params.put(key, decodeOnce(value)));
        }
        if (body != null && !body.isBlank()) {
            for (String pair : body.split("&")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                // body 为原始编码串（容器未解码），两次解码与 query 路径同一基准
                params.putIfAbsent(decodeOnce(decodeOnce(pair.substring(0, eq))),
                    decodeOnce(decodeOnce(pair.substring(eq + 1))));
            }
        }
        return params;
    }

    /**
     * 解析推送表单为接收结果（§8 第 6/8 条）：IM 单聊转访客消息并回大写 OK——已实锤字段
     * 无顾客级标识，会话粒度取门店 app_poi_code，push_content 内部结构未实锤按文本如实
     * 保存；订单/门店/其余 IM 家族与未知形态都是事件侧，只应答不落访客数据。IM 单聊缺
     * 必填字段抛 {@link IllegalArgumentException} 由调用方按参数错误拒绝。
     */
    public ChannelReceiveResult parse(Long companyChannelId, Map<String, String> form) {
        String bizType = form.get(PARAM_BIZ_TYPE);
        if (bizType != null) {
            return parseIm(companyChannelId, bizType, form);
        }
        // 订单（order_id）与门店（op_type）推送族及未知形态：美团推送族以事件为主体
        return ChannelReceiveResult.answer(EVENT_ACK);
    }

    private ChannelReceiveResult parseIm(Long companyChannelId, String bizType, Map<String, String> form) {
        if (!BIZ_TYPE_IM_CHAT.equals(bizType)) {
            // 匿名评价群聊等其余 biz_type：会话消息但不是 1 对 1 访客消息，只应答
            return ChannelReceiveResult.answer(IM_ACK);
        }
        String externalUserId = form.get(PARAM_APP_POI_CODE);
        String pushContent = form.get(PARAM_PUSH_CONTENT);
        if (externalUserId == null || externalUserId.isEmpty() || pushContent == null) {
            throw new IllegalArgumentException("美团单聊推送缺少必填字段");
        }
        // 渠道能力约束（meituan.md §5.4 服务端接入已知约束）：推送无消息级标识，
        // externalMessageId 恒空、渠道重推会产生重复消息；会话粒度为门店编码，
        // 同店顾客共享会话
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            externalUserId,
            null,
            null,
            List.of(),
            null,
            MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", pushContent));
        return ChannelReceiveResult.accept(inbound, IM_ACK);
    }

    // 宽容回退的渠道依据（meituan.md §8 工程语义）：官方只要求「解码 2 次」（guide/31、
    // docDetail/177），未定义畸形 % 序列的行为——保留已解码值，不为假想的乱码形态拒绝
    // 整单推送
    private String decodeOnce(String value) {
        if (value == null) {
            return null;
        }
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return value;
        }
    }
}
