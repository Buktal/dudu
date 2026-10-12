package com.dudu.duduserver.dto;

import java.util.List;

/**
 * Desk 名片保存输入：只接受共享标签与备注，缺失与空内容不同（note 空串表示清空）；
 * 渠道资料、身份字段与版本都不接受，由入站管道与服务端维护。取值校验按
 * 11000/11100/11200 语义在服务层给出，标签去首尾空白后保存。
 */
public record DeskProfileUpdateDTO(List<String> tags, String note) {
}
