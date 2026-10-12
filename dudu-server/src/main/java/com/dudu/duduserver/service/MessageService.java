package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.entity.MessageDO;

/**
 * 消息持久化服务，供 Desk 历史查询与后续发送票读写复用。
 */
public interface MessageService extends IService<MessageDO> {
}
