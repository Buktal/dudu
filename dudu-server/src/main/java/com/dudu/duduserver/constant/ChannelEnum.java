package com.dudu.duduserver.constant;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 渠道平台类型，按领域术语中的平台划分，不包含 MockPulse 的回调子类型；
 * displayName 供 Desk 展示渠道名，数据库与接口仍只交换平台代码。
 */
@Getter
@RequiredArgsConstructor
public enum ChannelEnum {

    WECHAT_MP("wechat-mp", "微信公众号"),
    WECHAT_MINI("wechat-mini", "微信小程序"),
    WECOM("wecom", "企业微信"),
    QQ("qq", "QQ机器人"),
    WEIBO("weibo", "微博"),
    FEISHU("feishu", "飞书"),
    ALIPAY("alipay", "支付宝"),
    DOUYIN("douyin", "抖音"),
    XIAOHONGSHU("xiaohongshu", "小红书"),
    BILIBILI("bilibili", "哔哩哔哩"),
    DINGTALK("dingtalk", "钉钉"),
    MEITUAN("meituan", "美团"),
    WHATSAPP("whatsapp", "WhatsApp");

    @EnumValue
    @JsonValue
    private final String code;

    // Desk 渠道筛选与列表展示用的显示名
    private final String displayName;

    // 数据库、JSON 与查询参数共用业务代码，拒绝未知值
    @JsonCreator
    public static ChannelEnum fromCode(String code) {
        for (ChannelEnum value : values()) {
            if (value.code.equals(code)) {
                return value;
            }
        }
        throw new IllegalArgumentException("未知的ChannelEnum: " + code);
    }
}
