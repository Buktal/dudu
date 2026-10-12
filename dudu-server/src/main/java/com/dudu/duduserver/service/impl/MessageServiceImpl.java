package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.mapper.MessageMapper;
import com.dudu.duduserver.service.MessageService;
import org.springframework.stereotype.Service;

/**
 * 消息持久化服务实现，当前只提供 IService 通用能力。
 */
@Service
public class MessageServiceImpl extends ServiceImpl<MessageMapper, MessageDO> implements MessageService {
}
