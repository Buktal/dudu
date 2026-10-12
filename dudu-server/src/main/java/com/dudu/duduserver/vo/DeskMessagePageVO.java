package com.dudu.duduserver.vo;

import java.util.List;

/**
 * Desk 历史分页结果：items 按 sequence 升序；还有更早消息时 nextCursor 为本页最小 sequence
 * 的十进制字符串，否则为 null；不计算全历史总数。
 */
public record DeskMessagePageVO(List<DeskMessageVO> items, String nextCursor) {
}
