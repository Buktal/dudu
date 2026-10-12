package com.dudu.duduserver.channel;

import com.dudu.duduserver.entity.CompanyChannelDO;

/**
 * 渠道素材读取边界：按账号与渠道素材标识（如公众号 media_id）读取素材原始字节，
 * 返回渠道给出的内容类型；实现负责把渠道协议与异常翻译成结果，不在此抛业务异常。
 * 只按消息中已保存的渠道标识读取，不接受任意外部 URL。
 */
public interface ChannelMediaReader {

    ChannelMediaResult read(CompanyChannelDO account, String externalMediaId);
}
