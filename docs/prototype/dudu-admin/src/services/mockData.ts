/**
 * DuduAdmin 内置演示沙箱数据源
 * 专供免后端环境下完整演示与体验后台各模块流转
 */

import {
  AuthSession,
  Company,
  CreateCompanyPayload,
  OperationLog,
  OverviewData,
  ResourceSummaryData,
  UpdateCompanyPayload,
  User,
} from '../types';

let mockCompanies: Company[] = [
  {
    companyId: '582713',
    companyName: '云川网络科技有限公司',
    contactName: '陈晨',
    contactInfo: '13800138001',
    remark: '首批入驻技术研发企业，多渠道客服试点单位',
    status: 'enabled',
    disableReason: null,
    createTime: '2026-09-28T08:30:00.000Z',
    updateTime: '2026-09-28T08:30:00.000Z',
    initialAdminUserId: '101',
    initialAdminUsername: 'admin',
  },
  {
    companyId: '316824',
    companyName: '禾木创意设计工作室',
    contactName: '林悦',
    contactInfo: '13900139002',
    remark: '视觉设计与品牌策划合作方',
    status: 'enabled',
    disableReason: null,
    createTime: '2026-09-27T09:15:00.000Z',
    updateTime: '2026-09-27T09:15:00.000Z',
    initialAdminUserId: '102',
    initialAdminUsername: 'admin',
  },
  {
    companyId: '749162',
    companyName: '青屿文化传媒有限公司',
    contactName: '周宁',
    contactInfo: '13700137003',
    remark: '新媒体矩阵与外部公关对接',
    status: 'disabled',
    disableReason: '服务合作期届满，等待商务续签中',
    createTime: '2026-09-25T14:20:00.000Z',
    updateTime: '2026-09-28T16:00:00.000Z',
    initialAdminUserId: '103',
    initialAdminUsername: 'admin',
  },
  {
    companyId: '619284',
    companyName: '极光智能物联科技有限公司',
    contactName: '赵鹏',
    contactInfo: '13600136004',
    remark: '智能硬件与 IoT 智能售后接待接入',
    status: 'enabled',
    disableReason: null,
    createTime: '2026-09-29T02:00:00.000Z',
    updateTime: '2026-09-29T02:00:00.000Z',
    initialAdminUserId: '104',
    initialAdminUsername: 'admin',
  },
  {
    companyId: '842105',
    companyName: '繁星云图信息技术有限公司',
    contactName: '钱静',
    contactInfo: '13500135005',
    remark: '企业协作与项目协同业务咨询',
    status: 'enabled',
    disableReason: null,
    createTime: '2026-09-24T11:00:00.000Z',
    updateTime: '2026-09-24T11:00:00.000Z',
    initialAdminUserId: '105',
    initialAdminUsername: 'admin',
  },
];

let mockLogs: OperationLog[] = [
  {
    operationLogId: '1',
    operatorUserId: '1',
    operatorUsername: 'Admin',
    companyId: '582713',
    action: 'create_company',
    targetType: 'company',
    targetId: '582713',
    result: 'success',
    summary: '开通企业「云川网络科技有限公司」，同步初始化管理员 admin',
    createTime: '2026-09-28T08:30:00.000Z',
  },
  {
    operationLogId: '2',
    operatorUserId: '1',
    operatorUsername: 'Admin',
    companyId: '749162',
    action: 'disable_company',
    targetType: 'company',
    targetId: '749162',
    result: 'success',
    summary: '停用企业服务：服务合作期届满，等待商务续签中',
    createTime: '2026-09-28T16:00:00.000Z',
  },
  {
    operationLogId: '3',
    operatorUserId: '1',
    operatorUsername: 'Admin',
    companyId: '316824',
    action: 'update_company',
    targetType: 'company',
    targetId: '316824',
    result: 'success',
    summary: '更新企业基本资料及联系人信息',
    createTime: '2026-09-28T18:10:00.000Z',
  },
];

export const mockBackend = {
  login(username: string): AuthSession {
    const user: User = {
      userId: '1',
      companyId: null,
      username: username || 'Admin',
      name: '平台管理员 (演示)',
      role: 'platform_admin',
      status: 'enabled',
      createTime: '2026-01-01T00:00:00.000Z',
    };
    return {
      token: 'mock-jwt-token-dudu-admin-preview',
      user,
    };
  },

  getOverview(): OverviewData {
    const enabled = mockCompanies.filter((c) => c.status === 'enabled').length;
    const disabled = mockCompanies.filter((c) => c.status === 'disabled').length;
    return {
      totalCompanies: mockCompanies.length,
      enabledCompanies: enabled,
      disabledCompanies: disabled,
      recentCompanies: [...mockCompanies].slice(0, 5),
    };
  },

  getCompanies(params: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
  }) {
    let list = [...mockCompanies];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.companyName.toLowerCase().includes(q) ||
          c.companyId.includes(q) ||
          (c.contactName && c.contactName.toLowerCase().includes(q))
      );
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((c) => c.status === params.status);
    }

    const page = params.page || 1;
    const size = params.size || 15;
    const total = list.length;
    const paginated = list.slice((page - 1) * size, page * size);

    return {
      list: paginated,
      total,
      page,
      size,
    };
  },

  getCompany(companyId: string): Company {
    const found = mockCompanies.find((c) => c.companyId === companyId);
    if (!found) {
      throw new Error(`未找到 ID 为 ${companyId} 的企业`);
    }
    return found;
  },

  generateCompanyId(): string {
    let candidate = '';
    do {
      const num = Math.floor(100000 + Math.random() * 900000);
      candidate = String(num);
    } while (mockCompanies.some((c) => c.companyId === candidate));
    return candidate;
  },

  checkCompanyIdAvailability(companyId: string): boolean {
    return !mockCompanies.some((c) => c.companyId === companyId);
  },

  createCompany(payload: CreateCompanyPayload): Company {
    if (mockCompanies.some((c) => c.companyId === payload.companyId)) {
      const err = new Error('企业 ID 已被占用');
      // @ts-expect-error code
      err.code = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const newCompany: Company = {
      companyId: payload.companyId,
      companyName: payload.companyName,
      contactName: payload.contactName || null,
      contactInfo: payload.contactInfo || null,
      remark: payload.remark || null,
      status: 'enabled',
      disableReason: null,
      createTime: now,
      updateTime: now,
      initialAdminUserId: String(Date.now()),
      initialAdminUsername: payload.initialAdmin.username || 'admin',
    };

    mockCompanies.unshift(newCompany);

    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId: payload.companyId,
      action: 'create_company',
      targetType: 'company',
      targetId: payload.companyId,
      result: 'success',
      summary: `开通企业「${payload.companyName}」，初始化管理员 ${payload.initialAdmin.username || 'admin'}`,
      createTime: now,
    });

    return newCompany;
  },

  updateCompany(companyId: string, payload: UpdateCompanyPayload): Company {
    const idx = mockCompanies.findIndex((c) => c.companyId === companyId);
    if (idx === -1) throw new Error('企业不存在');

    const now = new Date().toISOString();
    mockCompanies[idx] = {
      ...mockCompanies[idx],
      companyName: payload.companyName,
      contactName: payload.contactName || null,
      contactInfo: payload.contactInfo || null,
      remark: payload.remark || null,
      updateTime: now,
    };

    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId,
      action: 'update_company',
      targetType: 'company',
      targetId: companyId,
      result: 'success',
      summary: `编辑企业「${payload.companyName}」档案资料`,
      createTime: now,
    });

    return mockCompanies[idx];
  },

  disableCompany(companyId: string, disableReason: string) {
    const comp = mockCompanies.find((c) => c.companyId === companyId);
    if (!comp) throw new Error('企业不存在');
    comp.status = 'disabled';
    comp.disableReason = disableReason;
    comp.updateTime = new Date().toISOString();

    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId,
      action: 'disable_company',
      targetType: 'company',
      targetId: companyId,
      result: 'success',
      summary: `停用企业服务：${disableReason}`,
      createTime: new Date().toISOString(),
    });
  },

  enableCompany(companyId: string) {
    const comp = mockCompanies.find((c) => c.companyId === companyId);
    if (!comp) throw new Error('企业不存在');
    comp.status = 'enabled';
    comp.disableReason = null;
    comp.updateTime = new Date().toISOString();

    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId,
      action: 'enable_company',
      targetType: 'company',
      targetId: companyId,
      result: 'success',
      summary: `恢复企业正常运营服务`,
      createTime: new Date().toISOString(),
    });
  },

  resetAdminPassword(companyId: string) {
    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId,
      action: 'reset_admin_password',
      targetType: 'user',
      targetId: companyId,
      result: 'success',
      summary: `重置企业 (${companyId}) 管理员登录密码`,
      createTime: new Date().toISOString(),
    });
  },

  getResourceSummary(): ResourceSummaryData {
    const companies = mockCompanies.map((c, idx) => ({
      companyId: c.companyId,
      companyName: c.companyName,
      status: c.status,
      employeeCount: [12, 6, 18, 9, 14][idx % 5],
      receptionGroupCount: [3, 2, 4, 2, 3][idx % 5],
      channelAccountCount: [2, 1, 3, 2, 2][idx % 5],
      updateTime: c.updateTime,
    }));

    const totalEmployees = companies.reduce((acc, c) => acc + c.employeeCount, 0);
    const totalReceptionGroups = companies.reduce((acc, c) => acc + c.receptionGroupCount, 0);
    const totalChannelAccounts = companies.reduce((acc, c) => acc + c.channelAccountCount, 0);

    return {
      totalCompanies: mockCompanies.length,
      totalEmployees,
      totalReceptionGroups,
      totalChannelAccounts,
      companies,
    };
  },

  getOperationLogs(params: {
    page?: number;
    size?: number;
    search?: string;
    action?: string;
    result?: string;
  }) {
    let list = [...mockLogs];
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (l) =>
          l.summary.toLowerCase().includes(q) ||
          (l.targetId && l.targetId.includes(q)) ||
          l.operatorUsername.toLowerCase().includes(q)
      );
    }
    if (params.action && params.action !== 'all') {
      list = list.filter((l) => l.action === params.action);
    }
    if (params.result && params.result !== 'all') {
      list = list.filter((l) => l.result === params.result);
    }

    const page = params.page || 1;
    const size = params.size || 15;
    return {
      list: list.slice((page - 1) * size, page * size),
      total: list.length,
      page,
      size,
    };
  },

  changePassword() {
    mockLogs.unshift({
      operationLogId: String(Date.now()),
      operatorUserId: '1',
      operatorUsername: 'Admin',
      companyId: null,
      action: 'change_self_password',
      targetType: 'user',
      targetId: '1',
      result: 'success',
      summary: '平台管理员修改自身登录密码',
      createTime: new Date().toISOString(),
    });
  },
};
