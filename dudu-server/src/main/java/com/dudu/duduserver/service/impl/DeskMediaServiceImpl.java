package com.dudu.duduserver.service.impl;


import com.dudu.duduserver.channel.ChannelAdapterRegistry;
import com.dudu.duduserver.channel.ChannelMediaResult;
import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.entity.CompanyChannelDO;
import com.dudu.duduserver.entity.MessageDO;
import com.dudu.duduserver.service.CompanyChannelService;
import com.dudu.duduserver.service.DeskMediaService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.MessageService;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskMediaVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 消息媒体读取实现：消息 → 访客 → 授权账号的权限校验复用访客资源同一守卫（10106 / 12100），
 * 只按消息中已保存的引用读取——单媒体消息取 index=0 的 media，reply 取 attachments 下标，
 * 其余类型没有可读取的媒体。公开链接直接可用、不经本接口代理；需渠道凭据的素材再校验账号
 * 读取能力（12200）后经渠道边界取回字节，渠道失败按第三方错误如实返回（13100）。
 */
@Service
@RequiredArgsConstructor
public class DeskMediaServiceImpl implements DeskMediaService {

    // 契约第 4 节：单媒体承载体只含一个 media，reply 的媒体来自 attachments 数组
    private static final List<String> SINGLE_MEDIA_TYPES = List.of("image", "audio", "video", "file");
    private static final String TYPE_REPLY = "reply";

    private final MessageService messageService;
    private final DeskVisitorService deskVisitorService;
    private final CompanyChannelService companyChannelService;
    private final ChannelAdapterRegistry channelAdapters;

    @Override
    public DeskMediaVO media(JwtUser me, String messageId, String index) {
        int position = parseIndex(index);
        MessageDO message = messageService.getById(parseMessageId(messageId));
        if (message == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "消息不存在");
        }
        // 消息 → 访客 → 授权账号：复用访客资源同一守卫，越权 10106、访客缺失 12100
        DeskConversationVO conversation = deskVisitorService.get(me, String.valueOf(message.getVisitorId()));
        Map<String, Object> reference = referenceOf(message.getContent(), position);
        if (reference == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "该消息没有这个媒体");
        }
        // 公开链接由 Desk 直连渠道读取，本接口不代理，也不需要渠道凭据；
        // 这是请求目标不适用于本接口，按普通参数错误说明，不占用「渠道不允许」语义的 12200
        if (text(reference.get("url")) != null) {
            throw new BizException(ApiEnum.PARAM_ERROR, "该素材为公开链接，请直接使用其 URL");
        }
        String channelMediaId = text(reference.get("id"));
        if (channelMediaId == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "该媒体没有可读取的渠道标识");
        }
        CompanyChannelDO account = accountOf(conversation);
        String restriction = channelAdapters.mediaRestriction(account);
        if (restriction != null) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, restriction);
        }
        ChannelMediaResult result = channelAdapters.readMedia(account, channelMediaId);
        if (!result.succeeded()) {
            throw new BizException(ApiEnum.REQUEST_THIRD_ERROR, result.failureReason());
        }
        return new DeskMediaVO(result.bytes(), result.contentType());
    }

    // 序号从 0 开始；单媒体消息只有 index=0，reply 按 attachments 下标，越界与无媒体都返回空
    private Map<String, Object> referenceOf(Map<String, Object> content, int index) {
        if (content == null) {
            return null;
        }
        String type = text(content.get("type"));
        if (type == null) {
            return null;
        }
        if (SINGLE_MEDIA_TYPES.contains(type)) {
            return index == 0 ? mediaMap(content.get("media")) : null;
        }
        if (TYPE_REPLY.equals(type) && content.get("attachments") instanceof List<?> attachments) {
            return index < attachments.size() ? mediaMap(attachments.get(index)) : null;
        }
        return null;
    }

    // 已保存的媒体引用按 JSON 对象读取；不是对象时视为没有该媒体
    @SuppressWarnings("unchecked")
    private Map<String, Object> mediaMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : null;
    }

    // 渠道账号按访客身份读取；身份缺失按账号不可用处理，不猜测渠道目标
    private CompanyChannelDO accountOf(DeskConversationVO conversation) {
        String accountId = conversation.identity().accountId();
        if (!StringUtils.hasText(accountId)) {
            return null;
        }
        return companyChannelService.getById(Long.valueOf(accountId));
    }

    // index 缺省 0；只接受非负整数，非法取值 11000，不猜测序号
    private int parseIndex(String index) {
        if (!StringUtils.hasText(index)) {
            return 0;
        }
        int value;
        try {
            value = Integer.parseInt(index);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "媒体序号必须为非负整数");
        }
        if (value < 0) {
            throw new BizException(ApiEnum.PARAM_ERROR, "媒体序号必须为非负整数");
        }
        return value;
    }

    private Long parseMessageId(String messageId) {
        try {
            return Long.valueOf(messageId);
        } catch (NumberFormatException e) {
            throw new BizException(ApiEnum.PARAM_ERROR, "消息 ID 必须为十进制字符串");
        }
    }

    private String text(Object value) {
        return value instanceof String text && !text.isBlank() ? text : null;
    }
}
