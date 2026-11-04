package com.dudu.duduserver.channel.xiaohongshuthirdim;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.dudu.duduserver.channel.ChannelInboundMessage;
import com.dudu.duduserver.channel.support.Digests;
import com.dudu.duduserver.channel.support.Texts;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 小红书三方私信推送协议（事实见 docs/research/channels/xiaohongshu-third-im-spec.md）：
 * 公开网络仅线索推送面有规格——信封 {@code {data, timestamp, source}}，data 为线索字段
 * 表（§1.4 联调代码逐字），按渠道资料项落名片、固定文案落一条访客消息。验签走 header
 * X-Red-Signature（§1.2）：值形如 {@code sha1=<40 位 hex>}，以对接 token 为密钥对原始
 * body 生成签名且官方声明可选；算法两说并存——HMAC-SHA1（联调控制器，与官方「以 token
 * 为 secretKey」措辞吻合）与 SHA1(token+body) 拼接，双算法任一命中即过，联调阶段实测
 * 裁决。消息级推送信封不存在于公开网络（§1.5）：判型不符或线索缺归属身份一律返回空，
 * 由调用方按成功应答防平台整体三次重推（§1.3），不猜测解析。
 */
@Component
public class XiaohongshuThirdImProtocol {

    // 推送验签头（§1.2 三家代理商转述同一官方口径）；值形如 sha1=<40 位 hex>
    public static final String SIGNATURE_HEADER = "X-Red-Signature";
    private static final String SIGNATURE_PREFIX = "sha1=";

    // 线索信封三键（§1.4 联调代码信封）
    private static final String ENVELOPE_DATA = "data";
    private static final String ENVELOPE_TIMESTAMP = "timestamp";
    private static final String ENVELOPE_SOURCE = "source";

    // 线索字段表（§1.4 字段名逐字取自联调代码，SnakeCase 命名策略），标签按转述语义命名
    private static final String FIELD_LANDING_PAGE_ID = "landing_page_id";
    private static final String FIELD_URL = "url";
    private static final String FIELD_SUBMITTED_TIME = "submitted_time";
    private static final String FIELD_SOURCE_CHANNEL = "source_channel";
    private static final String FIELD_ACCOUNT_ID = "account_id";
    private static final String FIELD_ACCOUNT_NAME = "account_name";
    private static final String FIELD_CAMPAIGN_ID = "campaign_id";
    private static final String FIELD_CAMPAIGN_NAME = "campaign_name";
    private static final String FIELD_UNIT_ID = "unit_id";
    private static final String FIELD_UNIT_NAME = "unit_name";
    private static final String FIELD_CREATIVE_ID = "creative_id";
    private static final String FIELD_LEADS_ID = "leads_id";
    private static final String FIELD_KEYWORD = "keyword";
    private static final String FIELD_DATA = "data";
    private static final String PAIR_LABEL = "label";
    private static final String PAIR_VALUE = "value";

    // 线索落库为固定文案的访客消息：结构化字段全部进渠道资料项，不在消息文本里复述
    private static final String LEAD_TEXT = "收到小红书私信线索";

    // 结构化字段到资料项标签的映射：顺序即名片展示顺序
    private static final Map<String, String> LEAD_FIELD_LABELS = leadFieldLabels();

    /**
     * 推送验签（§1.2）：剥离 sha1= 前缀（官方文案含等号后空格形态，一并去除）后与
     * HMAC-SHA1 为主、SHA1(token+body) 拼接兜底的双算法摘要比对；材料缺失按不匹配处理。
     */
    public boolean verifySignature(String pushToken, String headerValue, String rawBody) {
        if (pushToken == null || pushToken.isEmpty() || rawBody == null || rawBody.isEmpty()) {
            return false;
        }
        String signature = stripSignature(headerValue);
        if (signature.isEmpty()) {
            return false;
        }
        byte[] token = pushToken.getBytes(StandardCharsets.UTF_8);
        byte[] body = rawBody.getBytes(StandardCharsets.UTF_8);
        if (Digests.constantTimeEquals(Digests.hmacSha1Hex(token, body), signature)) {
            return true;
        }
        String concatenated = pushToken + rawBody;
        return Digests.constantTimeEquals(Digests.sha1Hex(concatenated.getBytes(StandardCharsets.UTF_8)),
            signature);
    }

    /**
     * 解析线索推送：信封三键形态齐全（data 为对象、timestamp 为数字、source 为字符串）
     * 且线索携带 leads_id 时转为访客消息——externalUserId 取 leads_id 归属会话，
     * externalMessageId 取 leads_id:timestamp 让平台 30s×3 重推幂等；判型不符（未公开的
     * 消息级推送）、无法解析或缺归属身份返回空，由调用方只应答不落库。
     */
    public Optional<ChannelInboundMessage> parseLead(Long companyChannelId, String body) {
        if (body == null) {
            return Optional.empty();
        }
        JSONObject payload;
        try {
            payload = JSONUtil.parseObj(body);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        if (!(payload.get(ENVELOPE_DATA) instanceof JSONObject leads)
            || !(payload.get(ENVELOPE_TIMESTAMP) instanceof Number timestamp)
            || !(payload.get(ENVELOPE_SOURCE) instanceof String)) {
            return Optional.empty();
        }
        String leadsId = Texts.blankToNull(leads.getStr(FIELD_LEADS_ID));
        if (leadsId == null) {
            // 像线索信封但缺归属身份：可能是未公开的消息级推送，不拒绝也不落库
            return Optional.empty();
        }
        ChannelInboundMessage inbound = new ChannelInboundMessage(
            companyChannelId,
            leadsId,
            null,
            null,
            leadFields(leads),
            leadsId + ":" + timestamp,
            MessageDirectionEnum.INCOMING,
            Map.of("type", "text", "text", LEAD_TEXT));
        return Optional.of(inbound);
    }

    // 结构化字段与线索标签键值对（{label, value} 数组）合并为渠道资料项：字段缺失跳过，
    // 标签数组的 value 缺失按未提供保留标签（渠道给出的成对资料如实入名片）
    private List<ChannelInboundMessage.ChannelField> leadFields(JSONObject leads) {
        List<ChannelInboundMessage.ChannelField> fields = new ArrayList<>();
        for (Map.Entry<String, String> spec : LEAD_FIELD_LABELS.entrySet()) {
            String value = Texts.blankToNull(leads.getStr(spec.getKey()));
            if (value != null) {
                fields.add(new ChannelInboundMessage.ChannelField(spec.getValue(), value));
            }
        }
        JSONArray pairs = leads.getJSONArray(FIELD_DATA);
        if (pairs == null) {
            return fields;
        }
        for (Object item : pairs) {
            if (!(item instanceof JSONObject pair)) {
                continue;
            }
            String label = Texts.blankToNull(pair.getStr(PAIR_LABEL));
            if (label != null) {
                fields.add(new ChannelInboundMessage.ChannelField(label, pair.getStr(PAIR_VALUE)));
            }
        }
        return fields;
    }

    // 值形如 sha1=<hex>（官方文案 sha1= <hex> 含空格形态）：剥前缀后去除首尾空白
    private String stripSignature(String headerValue) {
        if (headerValue == null) {
            return "";
        }
        String value = headerValue.trim();
        if (value.startsWith(SIGNATURE_PREFIX)) {
            value = value.substring(SIGNATURE_PREFIX.length());
        }
        return value.trim();
    }

    private static Map<String, String> leadFieldLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put(FIELD_LANDING_PAGE_ID, "落地页 ID");
        labels.put(FIELD_URL, "发送地址");
        labels.put(FIELD_SUBMITTED_TIME, "提交时间");
        labels.put(FIELD_SOURCE_CHANNEL, "渠道");
        labels.put(FIELD_ACCOUNT_ID, "投放账号 ID");
        labels.put(FIELD_ACCOUNT_NAME, "投放账号名");
        labels.put(FIELD_CAMPAIGN_ID, "广告计划 ID");
        labels.put(FIELD_CAMPAIGN_NAME, "广告计划名");
        labels.put(FIELD_UNIT_ID, "广告单元 ID");
        labels.put(FIELD_UNIT_NAME, "广告单元名");
        labels.put(FIELD_CREATIVE_ID, "广告创意 ID");
        labels.put(FIELD_LEADS_ID, "线索 ID");
        labels.put(FIELD_KEYWORD, "关键词");
        return labels;
    }
}
