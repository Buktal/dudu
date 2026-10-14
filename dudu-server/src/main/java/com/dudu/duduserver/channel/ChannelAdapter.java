package com.dudu.duduserver.channel;

import com.dudu.duduserver.constant.ChannelEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import org.springframework.http.HttpHeaders;

import java.util.Map;

/**
 * 渠道适配器边界：一个实现对应一个已接入渠道，聚合该渠道的回调验证、入站接收、纯文本
 * 发送、素材读取与发送/读取能力说明；渠道协议、验签材料与凭据差异全部住在实现内，调用方
 * 只经注册表分派，不做渠道分支。入站落库留在业务层，receive 只返回解析结果。
 */
public interface ChannelAdapter {

    // 注册表路由键：一个渠道一个实现
    ChannelEnum channel();

    // GET 验证渠道服务器：签名有效时原样回显渠道提交的 echostr；无此阶段的渠道用默认实现应答不支持
    default ChannelCallbackResult verifyUrl(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers) {
        return ChannelCallbackResult.unsupported();
    }

    // POST 接收推送：验签并解析渠道原格式报文；结果携带 HTTP 应答与解析出的入站消息，落库由调用方负责
    ChannelReceiveResult receive(CompanyChannelDO account, Map<String, String> query, HttpHeaders headers, String body);

    // 纯文本发送：实现负责把渠道协议与异常翻译成结果，不在此抛业务异常；落库与推送由 Desk 发送流程负责
    ChannelSendResult send(CompanyChannelDO account, String externalUserId, String text);

    // 素材读取：只按消息中已保存的渠道标识读取，不接受任意外部 URL
    ChannelMediaResult readMedia(CompanyChannelDO account, String externalMediaId);

    // 当前账号可用的发送限制说明；null 表示可用纯文本发送
    String sendRestriction(CompanyChannelDO account);

    // 当前账号可用的素材读取限制说明；null 表示可用渠道凭据读取素材
    String mediaRestriction(CompanyChannelDO account);
}
