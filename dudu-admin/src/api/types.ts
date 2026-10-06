export type CompanyStatus = 1 | 0;

export interface Account {
  userId: string;
  username: string;
  name: string;
  role: "admin";
}

export interface LoginResult {
  token: string;
  exp: number;
  user: Account;
}

export interface CompanyProfile {
  companyName: string;
  contactName: string | null;
  contactInfo: string | null;
  remark: string | null;
}

export interface Company extends CompanyProfile {
  companyId: string;
  status: CompanyStatus;
  disableReason: string | null;
  createTime: string;
  updateTime: string;
}

export interface AdminInit {
  userId: string;
  username: string;
  name: string;
  status: CompanyStatus;
  createTime: string;
}

export interface CompanyDetail {
  company: Company;
  adminInit: AdminInit | null;
}

export interface CreateCompany extends CompanyProfile {
  companyId: string;
  adminInit: { username: string; password: string; name: string | null };
}

export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompanyQuery {
  keyword?: string;
  status?: CompanyStatus;
  page: number;
  pageSize: number;
}

export interface Overview {
  companyCount: number;
  companyEnabledCount: number;
  companyDisabledCount: number;
  companyCreatedLast7DaysCount: number;
  recentCompanies: Company[];
}

export interface Resources {
  companyId: string;
  userCount: number;
  userEnabledCount: number;
  userGroupCount: number;
  companyChannelCount: number;
}

export const operationActions = {
  "company.create": "创建企业",
  "company.update": "编辑企业",
  "company.disable": "停用企业",
  "company.enable": "恢复企业",
  "admin.password_reset": "重置管理员密码",
  "admin.password_change": "修改个人密码",
} as const;

export interface OperationLog {
  operationLogId: string;
  operatorUserId: string;
  companyId: string | null;
  action: keyof typeof operationActions;
  target: "company" | "user";
  targetId: string | null;
  summary: string | null;
  createTime: string;
}

export interface LogQuery {
  companyId?: string;
  action?: keyof typeof operationActions;
  page: number;
  pageSize: number;
}
