package com.dudu.duduserver.service;

import com.baomidou.mybatisplus.spring.service.IService;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.vo.CompanyDetailVO;
import com.dudu.duduserver.vo.CompanyIdAvailabilityVO;
import com.dudu.duduserver.vo.CompanyVO;

/**
 * 企业领域服务：Admin 首版的开通与维护闭环；企业 ID 显式选定、创建后固定。
 * 后续 Console / Desk 阶段复用同一份业务事实，不按前端另拆。
 */
public interface CompanyService extends IService<CompanyDO> {

    // 创建企业并初始化企业管理员，同一事务共同成功或共同失败；ID 冲突整体回滚
    CompanyVO createCompany(CompanyCreateDTO request, Long operatorUserId);

    // 企业详情：企业资料与初始管理员非敏感资料
    CompanyDetailVO getDetail(String companyId);

    // 企业列表：关键词（名称，六位数字时同时精确匹配 ID）+ 状态筛选 + 分页，创建时间倒序
    P<CompanyVO> list(CompanyListQuery query);

    // 完整编辑企业基础资料；null 表示清空选填字段，企业 ID 不可变更
    CompanyVO updateProfile(String companyId, CompanyUpdateDTO request, Long operatorUserId);

    // 停用企业：原因必填（空白报参数错误）写入记录；重复停用报错
    void disable(String companyId, String disableReason, Long operatorUserId);

    // 恢复企业：清空停用原因；未停用时报错
    void enable(String companyId, Long operatorUserId);

    // 重置企业初始管理员密码，目标由 company.init_user_id 稳定定位
    void resetInitialAdminPassword(String companyId, AdminPasswordResetDTO request, Long operatorUserId);

    // 在六位范围内随机生成候选并查重，有界重试；不预留号码
    String generateIdCandidate();

    // 检测企业 ID 是否可用；不缓存、不占号
    CompanyIdAvailabilityVO checkIdAvailability(String companyId);
}
