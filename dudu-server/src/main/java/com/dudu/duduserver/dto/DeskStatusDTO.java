package com.dudu.duduserver.dto;

/**
 * Desk 接待状态输入：status 仅接受 closed（结束）与 needs-reply（继续）；
 * 取值校验按 11000/11100 语义在服务层给出，其他状态值不写库。
 */
public record DeskStatusDTO(String status) {
}
