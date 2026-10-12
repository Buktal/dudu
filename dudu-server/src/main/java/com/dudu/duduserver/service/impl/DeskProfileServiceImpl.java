package com.dudu.duduserver.service.impl;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.dto.DeskProfileUpdateDTO;
import com.dudu.duduserver.entity.VisitorDO;
import com.dudu.duduserver.entity.VisitorProfileDO;
import com.dudu.duduserver.service.DeskProfileService;
import com.dudu.duduserver.service.DeskVisitorService;
import com.dudu.duduserver.service.VisitorProfileService;
import com.dudu.duduserver.service.VisitorService;
import com.dudu.duduserver.socket.DeskSocketGateway;
import com.dudu.duduserver.vo.DeskConversationVO;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 共享名片实现：权限与访客存在性复用访客守卫（10106/12100），输入校验先于持久读取。
 * 保存只改标签与备注，version 递增、update_time 刷新，渠道资料仍由入站管道维护；
 * 名片保存不触碰访客行，消息活动时间、摘要与排序不受影响。
 * 保存后返回并推送同一份完整名片（含操作者本人），不做版本冲突拒绝与反复确认。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeskProfileServiceImpl implements DeskProfileService {

    // 契约第 1 节：标签最多 20 个、每个 1–30 字（去首尾空白后判断），备注最多 4000 字
    private static final int TAGS_MAX = 20;
    private static final int TAG_MAX_LENGTH = 30;
    private static final int NOTE_MAX_LENGTH = 4000;

    private final DeskVisitorService deskVisitorService;
    private final VisitorService visitorService;
    private final VisitorProfileService visitorProfileService;
    private final DeskSocketGateway deskSocketGateway;

    @Override
    public DeskVisitorProfileVO profile(JwtUser me, String visitorId) {
        DeskConversationVO conversation = deskVisitorService.get(me, visitorId);
        return DeskVisitorProfileVO.of(requireProfile(Long.valueOf(conversation.id())));
    }

    @Override
    public DeskVisitorProfileVO save(JwtUser me, String visitorId, DeskProfileUpdateDTO request) {
        List<String> tags = requireTags(request.tags());
        String note = requireNote(request.note());
        DeskConversationVO conversation = deskVisitorService.get(me, visitorId);
        Long id = Long.valueOf(conversation.id());
        VisitorProfileDO profile = requireProfile(id);

        // JSON 列经实体类型处理器写入，与入站渠道资料同一规则；名片行独立递增版本
        VisitorProfileDO patch = new VisitorProfileDO();
        patch.setVisitorId(id);
        patch.setTags(tags);
        patch.setNote(note);
        patch.setVersion(profile.getVersion() + 1);
        visitorProfileService.updateById(patch);

        DeskVisitorProfileVO saved = DeskVisitorProfileVO.of(visitorProfileService.getById(id));
        pushProfile(visitorService.getById(id), saved);
        return saved;
    }

    // 名片与访客同事务创建：访客在库而名片缺失属于数据异常，按不存在语义返回
    private VisitorProfileDO requireProfile(Long visitorId) {
        VisitorProfileDO profile = visitorProfileService.getById(visitorId);
        if (profile == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "访客名片不存在");
        }
        return profile;
    }

    // 标签缺失 11100，数量与长度超限 11200；去首尾空白后为空不是合法标签，完全相同项只保留首次出现
    private List<String> requireTags(List<String> tags) {
        if (tags == null) {
            throw new BizException(ApiEnum.PARAM_MISSING, "缺少共享标签");
        }
        if (tags.size() > TAGS_MAX) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "标签最多 " + TAGS_MAX + " 个");
        }
        // 去重用有序集合，保留首次出现顺序（手动集合规约：用 Set 唯一性替代 List.contains 遍历）
        Set<String> normalized = new LinkedHashSet<>();
        for (String tag : tags) {
            String value = tag == null ? "" : tag.trim();
            if (value.isEmpty()) {
                throw new BizException(ApiEnum.PARAM_ERROR, "标签不能为空");
            }
            if (value.length() > TAG_MAX_LENGTH) {
                throw new BizException(ApiEnum.PARAM_EXCEED, "标签不能超过 " + TAG_MAX_LENGTH + " 字");
            }
            normalized.add(value);
        }
        return new ArrayList<>(normalized);
    }

    // 备注缺失 11100，超长 11200；空串是合法内容，表示清空并保留实际文字
    private String requireNote(String note) {
        if (note == null) {
            throw new BizException(ApiEnum.PARAM_MISSING, "缺少共享备注");
        }
        if (note.length() > NOTE_MAX_LENGTH) {
            throw new BizException(ApiEnum.PARAM_EXCEED, "备注不能超过 " + NOTE_MAX_LENGTH + " 字");
        }
        return note;
    }

    // 保存后推送一次 profile 报文（发给有权员工含操作者本人）；推送失败只记录，不影响已保存的名片
    private void pushProfile(VisitorDO visitor, DeskVisitorProfileVO profile) {
        if (visitor == null) {
            return;
        }
        try {
            deskSocketGateway.pushProfile(visitor.getCompanyId(), visitor.getCompanyChannelId(), profile);
        } catch (RuntimeException e) {
            log.error("[desk-profile] 推送名片失败, visitorId={}", profile.conversationId(), e);
        }
    }
}
