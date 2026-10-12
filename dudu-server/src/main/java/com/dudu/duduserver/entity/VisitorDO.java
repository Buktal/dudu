package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.dudu.duduserver.constant.VisitorStatusEnum;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 固定访客及会话共用实体：来源身份在账号内唯一，接待摘要支撑 Desk 列表与卡片，
 * 最后消息时间只随消息活动变化，名片保存不参与排序。
 */
@Data
@TableName("visitor")
public class VisitorDO {

    // 固定访客及会话共用 ID，自增
    @TableId(value = "visitor_id", type = IdType.AUTO)
    private Long visitorId;

    // 企业隔离
    private Long companyId;

    // 渠道账号，组权限从账号现有关系查询
    private Long companyChannelId;

    // 渠道访客身份，账号内唯一；二进制排序规则保留大小写差异
    private String externalUserId;

    // 名称；缺失时前端显示外部 ID
    private String name;

    // 渠道头像
    private String avatarUrl;

    // 共享接待状态，见 VisitorStatusEnum
    private VisitorStatusEnum status;

    // 当前最后一条持久消息
    private Long lastMessageId;

    // 列表和卡片摘要，保存规则同消息生成规则
    private String lastMessagePreview;

    // 最后消息活动时间；从未有消息时为空，排序与输出回落到创建时间
    private LocalDateTime lastMessageTime;

    // 本轮进入待回复的时间
    private LocalDateTime waitingSince;

    // 全部持久消息数量；同时分配会话内 sequence
    private Integer messageCount;

    // 对应现有 Conversation.version
    private Integer version;

    // 创建时间
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 最后修改时间
    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
