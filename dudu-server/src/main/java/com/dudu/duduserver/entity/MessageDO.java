package com.dudu.duduserver.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.dudu.duduserver.constant.MessageDirectionEnum;
import com.dudu.duduserver.constant.MessageSendStatusEnum;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 会话消息实体：会话内 sequence 是历史分页与稳定排序依据，content 保存统一消息体 JSON；
 * outgoing 才有发送员工、本地气泡标识与发送结果，其余方向为空。
 */
@Data
@TableName(value = "message", autoResultMap = true)
public class MessageDO {

    // 所有查询和通知共用的消息 ID，自增
    @TableId(value = "message_id", type = IdType.AUTO)
    private Long messageId;

    // 所属固定会话
    private Long visitorId;

    // 会话内稳定顺序，新增消息时使用递增后的 message_count
    private Integer sequence;

    // 消息方向，见 MessageDirectionEnum
    private MessageDirectionEnum direction;

    // outgoing 必填，来自登录员工；其他方向为空
    private Long senderUserId;

    // outgoing 的本地气泡关联标识
    private String clientRequestId;

    // 渠道已提供的消息标识，保留大小写差异
    private String externalMessageId;

    // 统一消息体 JSON；展示字段原样保存，渠道不提供的可选信息不填假值
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> content;

    // outgoing 的发送结果，见 MessageSendStatusEnum；其他方向为空
    private MessageSendStatusEnum sendStatus;

    // failed 时记录实际发送失败说明
    private String failureReason;

    // 对应现有 InboxMessage.version
    private Integer version;

    // 消息创建时间
    @TableField(value = "create_time", fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // 消息结果更新时间
    @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
