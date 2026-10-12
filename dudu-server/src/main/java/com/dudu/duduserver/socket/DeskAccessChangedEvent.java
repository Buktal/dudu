package com.dudu.duduserver.socket;

/**
 * 员工-组或账号-组关系在管理端保存后发布的范围变更事件；
 * 由实时网关向该企业已连接员工下发 access-changed 报文，使各工作区重查身份与列表。
 */
public record DeskAccessChangedEvent(Long companyId) {
}
