/**
 * DuduAdmin 前端模拟 Demo 数据服务
 * 纯前端驱动，无需后端服务即可完整体验所有业务交互
 */

import {
  AuthSession,
  Company,
  CreateCompanyPayload,
  IdAvailabilityResponse,
  IdCandidateResponse,
  OperationLog,
  OverviewData,
  ResourceSummaryData,
  UpdateCompanyPayload,
  User,
} from '../types';
import { mockBackend } from './mockData';

const TOKEN_KEY = 'dudu_admin_demo_token';
const USER_KEY = 'dudu_admin_demo_user';

export class ApiConnectionError extends Error {
  isConnectionError = true;
  targetUrl: string;
  constructor(message: string, targetUrl: string) {
    super(message);
    this.name = 'ApiConnectionError';
    this.targetUrl = targetUrl;
  }
}

export class ApiBusinessError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, msg: string, data?: unknown) {
    super(msg);
    this.name = 'ApiBusinessError';
    this.code = code;
    this.data = data;
  }
}

// 凭据管理
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || 'demo-admin-token';
  } catch {
    return 'demo-admin-token';
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);
    return {
      userId: '1',
      companyId: null,
      username: 'Admin',
      name: '平台管理员 (Demo)',
      role: 'platform_admin',
      status: 'enabled',
      createTime: '2026-01-01T00:00:00.000Z',
    };
  } catch {
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } catch {
    // ignore
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

/**
 * 前端模拟 Demo API 方法集
 */
export const adminApi = {
  /**
   * 连通性探测 (模拟总是正常)
   */
  async pingHealth(): Promise<{ ok: boolean; latencyMs: number; statusText: string }> {
    await new Promise((r) => setTimeout(r, 60));
    return {
      ok: true,
      latencyMs: 15,
      statusText: '前端模拟环境运行中',
    };
  },

  /**
   * 平台管理员登录
   */
  async login(username: string, _password?: string): Promise<AuthSession> {
    await new Promise((r) => setTimeout(r, 150));
    const session = mockBackend.login(username);
    setAuthSession(session);
    return session;
  },

  /**
   * 获取当前用户
   */
  async getMe(): Promise<User> {
    await new Promise((r) => setTimeout(r, 50));
    return getStoredUser() || mockBackend.login('Admin').user;
  },

  /**
   * 修改自身密码
   */
  async changePassword(_current: string, _newPass: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    mockBackend.changePassword();
  },

  /**
   * 运营概览数据
   */
  async getOverview(): Promise<OverviewData> {
    await new Promise((r) => setTimeout(r, 100));
    return mockBackend.getOverview();
  },

  /**
   * 企业列表查询
   */
  async getCompanies(params: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
  }): Promise<{ list: Company[]; total: number; page: number; size: number }> {
    await new Promise((r) => setTimeout(r, 100));
    return mockBackend.getCompanies(params);
  },

  /**
   * 企业详情
   */
  async getCompany(companyId: string): Promise<Company> {
    await new Promise((r) => setTimeout(r, 50));
    return mockBackend.getCompany(companyId);
  },

  /**
   * 随机生成候选企业 ID
   */
  async generateCompanyId(): Promise<IdCandidateResponse> {
    await new Promise((r) => setTimeout(r, 120));
    return { companyId: mockBackend.generateCompanyId() };
  },

  /**
   * 检测六位企业 ID 可用性
   */
  async checkCompanyIdAvailability(companyId: string): Promise<IdAvailabilityResponse> {
    await new Promise((r) => setTimeout(r, 120));
    return {
      companyId,
      available: mockBackend.checkCompanyIdAvailability(companyId),
    };
  },

  /**
   * 创建企业及初始管理员
   */
  async createCompany(payload: CreateCompanyPayload): Promise<Company> {
    await new Promise((r) => setTimeout(r, 200));
    try {
      return mockBackend.createCompany(payload);
    } catch (err: unknown) {
      // @ts-expect-error code
      if (err?.code === 409) {
        throw new ApiBusinessError(409, '企业 ID 已被占用，请重新选择');
      }
      throw err;
    }
  },

  /**
   * 编辑企业基本资料
   */
  async updateCompany(companyId: string, payload: UpdateCompanyPayload): Promise<Company> {
    await new Promise((r) => setTimeout(r, 150));
    return mockBackend.updateCompany(companyId, payload);
  },

  /**
   * 停用企业
   */
  async disableCompany(companyId: string, disableReason: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    mockBackend.disableCompany(companyId, disableReason);
  },

  /**
   * 恢复企业
   */
  async enableCompany(companyId: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    mockBackend.enableCompany(companyId);
  },

  /**
   * 重置企业管理员密码
   */
  async resetAdminPassword(companyId: string, _newPassword: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    mockBackend.resetAdminPassword(companyId);
  },

  /**
   * 企业资源汇总
   */
  async getResourceSummary(): Promise<ResourceSummaryData> {
    await new Promise((r) => setTimeout(r, 100));
    return mockBackend.getResourceSummary();
  },

  /**
   * 平台审计操作记录
   */
  async getOperationLogs(params: {
    page?: number;
    size?: number;
    search?: string;
    action?: string;
    result?: string;
  }): Promise<{ list: OperationLog[]; total: number; page: number; size: number }> {
    await new Promise((r) => setTimeout(r, 100));
    return mockBackend.getOperationLogs(params);
  },
};
