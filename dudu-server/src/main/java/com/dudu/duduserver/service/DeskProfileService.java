package com.dudu.duduserver.service;

import com.dudu.duduserver.config.auth.JwtUser;
import com.dudu.duduserver.dto.DeskProfileUpdateDTO;
import com.dudu.duduserver.vo.DeskVisitorProfileVO;

/**
 * Desk 访客名片服务：读取与保存共用访客守卫（10106/12100），保存只写共享标签与备注，
 * 渠道资料由入站管道维护；保存后返回完整名片供 HTTP 返回与 profile 推送共用。
 */
public interface DeskProfileService {

    // 读取当前访客名片：渠道资料三态原样返回，不重复身份字段
    DeskVisitorProfileVO profile(JwtUser me, String visitorId);

    // 保存共享标签与备注：version 递增、update_time 刷新，返回并推送后端保存的完整名片
    DeskVisitorProfileVO save(JwtUser me, String visitorId, DeskProfileUpdateDTO request);
}
