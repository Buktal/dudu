package com.dudu.duduserver.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.spring.service.impl.ServiceImpl;
import com.dudu.duduserver.common.P;
import com.dudu.duduserver.config.exception.BizException;
import com.dudu.duduserver.constant.ApiEnum;
import com.dudu.duduserver.constant.EnableStatusEnum;
import com.dudu.duduserver.constant.OperationActionEnum;
import com.dudu.duduserver.dto.*;
import com.dudu.duduserver.entity.CompanyDO;
import com.dudu.duduserver.entity.UserDO;
import com.dudu.duduserver.mapper.CompanyMapper;
import com.dudu.duduserver.service.CompanyService;
import com.dudu.duduserver.service.OperationLogService;
import com.dudu.duduserver.service.UserService;
import com.dudu.duduserver.util.CompanyIdPolicy;
import com.dudu.duduserver.vo.CompanyAdminInitVO;
import com.dudu.duduserver.vo.CompanyDetailVO;
import com.dudu.duduserver.vo.CompanyIdAvailabilityVO;
import com.dudu.duduserver.vo.CompanyVO;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 企业领域服务实现，SQL 全部经 MyBatis-Plus 通用能力与 Lambda 构造器表达。
 * 完整编辑与停用恢复使用 Wrapper 显式 set（含 null 清空），并手工写 updateTime（Wrapper 更新不触发自动填充）。
 */
@Service
@RequiredArgsConstructor
public class CompanyServiceImpl extends ServiceImpl<CompanyMapper, CompanyDO> implements CompanyService {

    // 随机企业 ID 的有界重试上限；全部碰撞时如实报告暂未找到，不断言号段耗尽
    private static final int ID_CANDIDATE_MAX_ATTEMPTS = 50;

    // 企业 ID 被占用的统一提示：预检命中与主键冲突并发抢占共用
    private static final String MSG_COMPANY_ID_OCCUPIED = "企业 ID 已被占用，请重新选择";

    // 企业名 LIKE 的显式转义字符片段（口径同 Desk 访客搜索的 DeskVisitorServiceImpl）
    private static final String LIKE_ESCAPE = " ESCAPE '!'";

    private final UserService userService;
    private final OperationLogService operationLogService;
    private final SecureRandom secureRandom = new SecureRandom();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CompanyVO createCompany(CompanyCreateDTO request, Long operatorUserId) {
        Long companyId = CompanyIdPolicy.parseCompanyId(request.companyId());
        if (getById(companyId) != null) {
            throw new BizException(ApiEnum.DATA_EXIST, MSG_COMPANY_ID_OCCUPIED);
        }

        CompanyDO company = new CompanyDO();
        company.setCompanyId(companyId);
        company.setCompanyName(request.companyName());
        company.setContactName(request.contactName());
        company.setContactInfo(request.contactInfo());
        company.setRemark(request.remark());
        company.setStatus(EnableStatusEnum.ENABLED);
        try {
            save(company);
        } catch (DuplicateKeyException e) {
            // 检测通过后被并发抢占：主键唯一约束最终裁决，整体回滚
            throw new BizException(ApiEnum.DATA_EXIST, MSG_COMPANY_ID_OCCUPIED);
        }

        UserDO admin = userService.createInitialAdmin(companyId, request.adminInit());
        CompanyDO link = new CompanyDO();
        link.setCompanyId(companyId);
        link.setInitUserId(admin.getUserId());
        updateById(link);

        operationLogService.appendSuccess(operatorUserId, companyId, OperationActionEnum.COMPANY_CREATE,
            companyId,
            "创建企业「" + request.companyName() + "」，初始管理员 " + request.adminInit().username());
        return CompanyVO.of(getById(companyId));
    }

    @Override
    public CompanyDetailVO getDetail(String companyId) {
        CompanyDO company = requireCompany(companyId);
        CompanyAdminInitVO adminInit = null;
        if (company.getInitUserId() != null) {
            UserDO admin = userService.getById(company.getInitUserId());
            if (admin != null) {
                adminInit = CompanyAdminInitVO.of(admin);
            }
        }
        return new CompanyDetailVO(CompanyVO.of(company), adminInit);
    }

    @Override
    public P<CompanyVO> list(CompanyListQuery query) {
        LambdaQueryWrapper<CompanyDO> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String keyword = query.getKeyword().trim();
            Long keywordId = CompanyIdPolicy.isValid(keyword) ? Long.valueOf(keyword) : null;
            String pattern = "%" + escapeLike(keyword) + "%";
            wrapper.and(w -> {
                // Lambda 的 like 无法表达 ESCAPE，用受支持的固定 SQL 片段追加，转义字符显式指定为 !、
                // 不随连接默认值变化，词条仍走占位符参数绑定（口径同 DeskVisitorServiceImpl）
                w.apply("company_name LIKE {0}" + LIKE_ESCAPE, pattern);
                if (keywordId != null) {
                    w.or().eq(CompanyDO::getCompanyId, keywordId);
                }
            });
        }
        if (query.getStatus() != null) {
            wrapper.eq(CompanyDO::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(CompanyDO::getCreateTime).orderByDesc(CompanyDO::getCompanyId);

        // 先计数供 P 钳位页码（超出总页数取最后一页），分页查询本身不再重复计数
        long total = count(wrapper);
        Page<CompanyDO> result = query.toPage(total);
        if (total > 0) {
            result = page(result, wrapper);
        }
        result.setTotal(total);
        List<CompanyVO> views = result.getRecords().stream().map(CompanyVO::of).toList();
        return P.ok(result, views);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CompanyVO updateProfile(String companyId, CompanyUpdateDTO request, Long operatorUserId) {
        CompanyDO existing = requireCompany(companyId);
        Long id = existing.getCompanyId();

        lambdaUpdate()
            .eq(CompanyDO::getCompanyId, id)
            .set(CompanyDO::getCompanyName, request.companyName())
            .set(CompanyDO::getContactName, request.contactName())
            .set(CompanyDO::getContactInfo, request.contactInfo())
            .set(CompanyDO::getRemark, request.remark())
            .set(CompanyDO::getUpdateTime, LocalDateTime.now())
            .update();

        operationLogService.appendSuccess(operatorUserId, id, OperationActionEnum.COMPANY_UPDATE,
            id, "编辑企业「" + request.companyName() + "」基础资料");
        return CompanyVO.of(getById(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void disable(String companyId, String disableReason, Long operatorUserId) {
        if (!StringUtils.hasText(disableReason)) {
            throw new BizException(ApiEnum.PARAM_ERROR, "停用原因不能为空");
        }
        CompanyDO company = requireCompany(companyId);
        if (company.getStatus() != null && company.getStatus() == EnableStatusEnum.DISABLED) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业已停用");
        }
        boolean updated = lambdaUpdate()
            .eq(CompanyDO::getCompanyId, company.getCompanyId())
            .eq(CompanyDO::getStatus, EnableStatusEnum.ENABLED)
            .set(CompanyDO::getStatus, EnableStatusEnum.DISABLED)
            .set(CompanyDO::getDisableReason, disableReason)
            .set(CompanyDO::getUpdateTime, LocalDateTime.now())
            .update();
        if (!updated) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业状态已改变，请刷新后重试");
        }
        operationLogService.appendSuccess(operatorUserId, company.getCompanyId(),
            OperationActionEnum.COMPANY_DISABLE, company.getCompanyId(),
            "停用企业「" + company.getCompanyName() + "」：" + disableReason);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void enable(String companyId, Long operatorUserId) {
        CompanyDO company = requireCompany(companyId);
        if (company.getStatus() != null && company.getStatus() == EnableStatusEnum.ENABLED) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业已启用");
        }
        boolean updated = lambdaUpdate()
            .eq(CompanyDO::getCompanyId, company.getCompanyId())
            .eq(CompanyDO::getStatus, EnableStatusEnum.DISABLED)
            .set(CompanyDO::getStatus, EnableStatusEnum.ENABLED)
            .set(CompanyDO::getDisableReason, null)
            .set(CompanyDO::getUpdateTime, LocalDateTime.now())
            .update();
        if (!updated) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "企业状态已改变，请刷新后重试");
        }
        operationLogService.appendSuccess(operatorUserId, company.getCompanyId(),
            OperationActionEnum.COMPANY_ENABLE, company.getCompanyId(),
            "恢复企业「" + company.getCompanyName() + "」");
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void resetInitialAdminPassword(String companyId, AdminPasswordResetDTO request, Long operatorUserId) {
        CompanyDO company = requireCompany(companyId);
        Long adminId = company.getInitUserId();
        if (adminId == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "企业未初始化管理员");
        }
        UserDO admin = userService.getById(adminId);
        if (admin == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "企业管理员不存在");
        }
        if (!company.getCompanyId().equals(admin.getCompanyId())) {
            throw new BizException(ApiEnum.DATA_NOT_ALLOW, "管理员不属于该企业");
        }
        userService.updatePassword(adminId, request.newPassword());
        operationLogService.appendSuccess(operatorUserId, company.getCompanyId(),
            OperationActionEnum.ADMIN_PASSWORD_RESET, adminId,
            "重置企业「" + company.getCompanyName() + "」初始管理员 " + admin.getUsername() + " 的密码");
    }

    @Override
    public String generateIdCandidate() {
        for (int attempt = 0; attempt < ID_CANDIDATE_MAX_ATTEMPTS; attempt++) {
            long candidate = CompanyIdPolicy.MIN
                + secureRandom.nextLong(CompanyIdPolicy.MAX - CompanyIdPolicy.MIN + 1);
            if (getById(candidate) == null) {
                return String.valueOf(candidate);
            }
        }
        throw new BizException(ApiEnum.DATA_ERROR, "暂未找到可用企业 ID，请重试");
    }

    @Override
    public CompanyIdAvailabilityVO checkIdAvailability(String companyId) {
        Long id = CompanyIdPolicy.parseCompanyId(companyId);
        return new CompanyIdAvailabilityVO(String.valueOf(id), getById(id) == null);
    }

    // 通配符转义：! 自身先转义（后两步替换会引入 !），% 与 _ 变为字面量；与 SQL 中显式
    // ESCAPE '!' 一致，字面匹配不随连接默认转义字符、sql_mode 变化（口径同 DeskVisitorServiceImpl）
    private String escapeLike(String term) {
        return term.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    // 解析并校验企业 ID，不存在时报数据不存在
    private CompanyDO requireCompany(String companyId) {
        Long id = CompanyIdPolicy.parseCompanyId(companyId);
        CompanyDO company = getById(id);
        if (company == null) {
            throw new BizException(ApiEnum.DATA_NOT_EXIST, "企业不存在");
        }
        return company;
    }
}
