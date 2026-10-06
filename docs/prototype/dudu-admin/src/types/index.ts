/**
 * DuduAdmin 核心业务类型定义
 * 契约参考：docs/design/dudu-admin/data-contract.md 与 company-onboarding.md
 */

export type CompanyStatus = 'enabled' | 'disabled';

export interface Company {
  companyId: string; // 严格 6 位十进制字符串 (100000 - 999999)
  companyName: string;
  contactName: string | null;
  contactInfo: string | null;
  remark: string | null;
  status: CompanyStatus;
  disableReason: string | null;
  createTime: string; // ISO 8601 UTC 带 Z
  updateTime: string; // ISO 8601 UTC 带 Z
  initialAdminUserId?: string | null;
  initialAdminUsername?: string | null;
}

export interface InitialAdminInput {
  username: string; // 初始管理员登录名，默认 admin
  password: string; // 初始管理员密码
}

export interface CreateCompanyPayload {
  companyId: string;
  companyName: string;
  contactName?: string | null;
  contactInfo?: string | null;
  remark?: string | null;
  initialAdmin: InitialAdminInput;
}

export interface UpdateCompanyPayload {
  companyName: string;
  contactName?: string | null;
  contactInfo?: string | null;
  remark?: string | null;
}

export type UserRole = 'platform_admin' | 'company_admin' | 'employee';

export interface User {
  userId: string;
  companyId: string | null; // 平台人员为空
  username: string;
  name: string;
  role: UserRole;
  status: 'enabled' | 'disabled';
  createTime: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface OperationLog {
  operationLogId: string;
  operatorUserId: string;
  operatorUsername: string;
  companyId: string | null;
  action: 'create_company' | 'update_company' | 'disable_company' | 'enable_company' | 'reset_admin_password' | 'change_self_password';
  targetType: 'company' | 'user';
  targetId: string | null;
  result: 'success' | 'failure';
  summary: string;
  createTime: string;
}

export interface OverviewData {
  totalCompanies: number;
  enabledCompanies: number;
  disabledCompanies: number;
  recentCompanies: Company[];
}

export interface CompanyResourceItem {
  companyId: string;
  companyName: string;
  status: CompanyStatus;
  employeeCount: number;
  receptionGroupCount: number;
  channelAccountCount: number;
  updateTime: string;
}

export interface ResourceSummaryData {
  totalCompanies: number;
  totalEmployees: number;
  totalReceptionGroups: number;
  totalChannelAccounts: number;
  companies: CompanyResourceItem[];
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface IdCandidateResponse {
  companyId: string;
}

export interface IdAvailabilityResponse {
  companyId: string;
  available: boolean;
}

export type EnvType = 'mock' | 'local' | 'online';

export interface EnvironmentConfig {
  type: EnvType;
  localUrl: string;
  onlineUrl: string;
  activeUrl: string;
  isDev: boolean;
}
