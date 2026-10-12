package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.vo.DeskMediaVO;

/**
 * Desk 消息媒体服务：按消息内序号读取消息中已保存的媒体引用，需渠道凭据的素材经渠道
 * 读取边界按需取回字节；公开链接不经本接口代理，不建媒体表与永久副本。
 */
public interface DeskMediaService {

    // index 缺省 0：单媒体消息的 index=0，reply 使用 attachments 数组下标
    DeskMediaVO media(JwtUser me, String messageId, String index);
}
