export type CompanyStatus = "enabled" | "disabled";

export interface Account {
  userId: string;
  username: string;
  name: string;
  role: "platform_admin";
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

export interface InitialAdmin {
  userId: string;
  username: string;
  name: string;
  status: CompanyStatus;
  createTime: string;
}

export interface CompanyDetail {
  company: Company;
  initialAdmin: InitialAdmin | null;
}

export interface CreateCompany extends CompanyProfile {
  companyId: string;
  initialAdmin: { username: string; password: string; name: string | null };
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
  totalCompanies: number;
  enabledCompanies: number;
  disabledCompanies: number;
  recentCreatedCount: number;
  recentCompanies: Company[];
}

export interface Resources {
  companyId: string;
  employeeCount: number;
  enabledEmployeeCount: number;
  groupCount: number;
  channelAccountCount: number;
}

export const operationActions = {
  "company.create": "创建企业",
  "company.update": "编辑企业",
  "company.disable": "停用企业",
  "company.enable": "恢复企业",
  "admin.password_reset": "重置管理员密码",
  "account.password_change": "修改个人密码",
} as const;

export interface OperationLog {
  operationLogId: string;
  operatorUserId: string;
  companyId: string | null;
  action: keyof typeof operationActions;
  targetType: "company" | "user";
  targetId: string | null;
  result: "success" | "failure";
  summary: string | null;
  createTime: string;
}

export interface LogQuery {
  companyId?: string;
  action?: keyof typeof operationActions;
  result?: "success" | "failure";
  page: number;
  pageSize: number;
}
