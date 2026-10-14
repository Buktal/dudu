package com.dudu.duduserver.channel.douyin;

/**
 * 抖音回复上下文（事实见 docs/research/channels/douyin.md §6.1）：发送私信是场景一
 * 回复接口，msg_id（来信 server_message_id）、conversation_id 与发送方 open_id
 * （信封 to_user_id）均派生自入站 webhook，由入站侧随消息留存；发送时按
 * companyChannelId + externalUserId 取访客最近一封来信解出三要素。
 */
public interface DouyinReplyContext {

    // 查不到可回复来信或留存标识不完整时返回 null，由发送侧如实失败
    Reply lookup(Long companyChannelId, String externalUserId);

    // 回复三要素：msg_id 24 小时时效、conversation_id 长期有效、owner 为账号 open_id
    record Reply(String msgId, String conversationId, String ownerOpenId) {
    }
}
