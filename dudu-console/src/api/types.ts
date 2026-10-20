export interface Profile {
  company: { companyId: string; companyName: string };
  user: {
    userId: string;
    username: string;
    name: string;
    role: "console";
    isInitialAdmin: boolean;
  };
  managedGroupIds: string[];
}
export interface LoginResult {
  token: string;
  expiresAt: number;
  profile: Profile;
}
export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type CompanyStatus = 0 | 1;
