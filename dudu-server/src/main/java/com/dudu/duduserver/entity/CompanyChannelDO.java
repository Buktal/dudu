package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.dudu.duduserver.constant.ChannelEnum;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 渠道接入账号，一个账号只归属一个接待组。本轮仅支撑资源汇总的真实计数，
 * 启停、授权与连接健康状态由 Console 阶段另行设计。
 */
@Data
@TableName(value = "company_channel", autoResultMap = true)
public class CompanyChannelDO {

    // 渠道接入账号标识，自增
    @TableId(value = "company_channel_id", type = IdType.AUTO)
    private Long companyChannelId;

    // 所属企业
    private Long companyId;

    // 唯一负责的接待组
    private Long groupId;

    // 渠道类型（微信/支付宝等）
    private ChannelEnum channel;

    // 账号展示名称
    private String accountName;

    // 渠道信息；按实际查询需求提取独立字段，授权凭据另行设计
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> channelInfo;

    // 创建时间
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间
    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
