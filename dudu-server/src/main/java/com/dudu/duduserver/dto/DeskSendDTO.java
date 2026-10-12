package com.dudu.duduserver.dto;

/**
 * Desk 发送文本输入：只接受本地气泡标识与正文；附件、发送员工与发送结果字段不接受，
 * 实际发送员工来自登录身份，渠道目标取自访客归属。取值校验按 11000/11100/11200
 * 语义在服务层给出，正文保留实际文字与换行。
 */
public record DeskSendDTO(String clientRequestId, String text) {
}
