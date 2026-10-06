import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  Building2,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Edit,
  Power,
  KeyRound,
  Filter,
} from 'lucide-react';
import { Company, CompanyStatus } from '../../types';
import { adminApi, ApiConnectionError } from '../../services/api';
import { getEnvironmentConfig } from '../../services/env';
import { ConnectionErrorState } from '../common/ConnectionErrorState';
import { CreateCompanyDrawer } from './CreateCompanyDrawer';
import { CompanyDetailModal } from './CompanyDetailModal';
import { EditCompanyModal } from './EditCompanyModal';
import { DisableCompanyModal } from './DisableCompanyModal';
import { ResetPasswordModal } from './ResetPasswordModal';

interface CompanyListViewProps {
  onOpenEnvModal?: () => void;
}

export const CompanyListView: React.FC<CompanyListViewProps> = ({ onOpenEnvModal }) => {
  const envConfig = getEnvironmentConfig();

  // 列表数据与状态
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CompanyStatus>('all');
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // 弹窗状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isToggleStatusOpen, setIsToggleStatusOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);

  // 成功反馈提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    try {
      const res = await adminApi.getCompanies({
        page,
        size: pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setCompanies(res.list || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setConnectionError(err.message);
      } else if (err instanceof Error) {
        setConnectionError(err.message || '获取企业列表失败');
      } else {
        setConnectionError('获取企业列表失败');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCompanies();
  };

  const handleCreateSuccess = (newCompany: Company) => {
    showToast(`企业「${newCompany.companyName}」（ID: ${newCompany.companyId}）开通成功！`);
    fetchCompanies();
  };

  const handleUpdateSuccess = (updated: Company) => {
    showToast(`企业「${updated.companyName}」资料已更新`);
    fetchCompanies();
  };

  const handleStatusChangeSuccess = () => {
    showToast('企业服务状态已变更');
    fetchCompanies();
  };

  const handleResetPasswordSuccess = () => {
    showToast('管理员登录密码已重置');
    fetchCompanies();
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast 提示条 */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 顶部标题与主要操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            企业管理
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            运营方入驻企业开通与全局档案维护（共 <span className="font-mono tabular-nums font-semibold text-slate-800">{total}</span> 家企业）
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchCompanies()}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer shadow-2xs"
            title="刷新列表"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#F2785C]' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#F2785C] hover:bg-[#E06448] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>创建企业</span>
          </button>
        </div>
      </div>

      {/* 搜索与状态过滤工具栏 */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs">
        {/* 搜索框 */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute inset-y-0 left-3 my-auto pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索企业名称或 6 位企业 ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
          />
        </form>

        {/* 状态分段控制器 (遵从 Zero-Pill 规范中的交互按钮控件) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setPage(1);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            全部状态
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('enabled');
              setPage(1);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
              statusFilter === 'enabled'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            正常启用
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('disabled');
              setPage(1);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
              statusFilter === 'disabled'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            已停用
          </button>
        </div>
      </div>

      {/* 数据表格区域 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* 连接失败处理 (遵从规范：不可伪造假数据或空列表) */}
        {connectionError ? (
          <ConnectionErrorState
            activeUrl={envConfig.activeUrl}
            onRetry={fetchCompanies}
            onOpenEnvModal={onOpenEnvModal}
            title="企业列表获取失败"
            description={connectionError}
          />
        ) : loading && companies.length === 0 ? (
          /* 加载骨架屏 */
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/6"></div>
                <div className="h-4 bg-slate-200 rounded w-1/8"></div>
                <div className="h-4 bg-slate-200 rounded w-1/12"></div>
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          /* 空数据状态 */
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">暂无企业数据</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'all'
                ? '未找到符合当前搜索及筛选条件的企业，请尝试重置过滤条件。'
                : '当前平台尚未开通企业，点击上方「创建企业」录入首家企业档案。'}
            </p>
            {(!search && statusFilter === 'all') && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                开通首家企业
              </button>
            )}
          </div>
        ) : (
          /* 正常数据列表 */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold select-none">
                  <th className="py-3 px-4">企业名称</th>
                  <th className="py-3 px-4">企业 ID</th>
                  <th className="py-3 px-4">联系人与电话</th>
                  <th className="py-3 px-4">服务状态</th>
                  <th className="py-3 px-4">开通时间</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => {
                  const isEnabled = c.status === 'enabled';
                  return (
                    <tr
                      key={c.companyId}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      {/* 企业名称 */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 group-hover:text-[#F2785C] transition-colors">
                          {c.companyName}
                        </div>
                        {c.remark && (
                          <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                            {c.remark}
                          </div>
                        )}
                      </td>

                      {/* 企业 ID: 严格等宽数字 */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800 tabular-nums">
                        {c.companyId}
                      </td>

                      {/* 联系人 */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {c.contactName || c.contactInfo ? (
                          <div>
                            <span className="font-medium text-slate-800">{c.contactName || '-'}</span>
                            {c.contactInfo && (
                              <span className="text-[11px] text-slate-500 ml-1.5">
                                ({c.contactInfo})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">未填写</span>
                        )}
                      </td>

                      {/* 状态 (无糖果胶囊，遵从 zero-pill 规范) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isEnabled ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span
                            className={`font-medium ${
                              isEnabled ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isEnabled ? '正常启用' : '已停用'}
                          </span>
                        </div>
                      </td>

                      {/* 创建时间 */}
                      <td className="py-3.5 px-4 text-slate-500 font-mono tabular-nums">
                        {formatDate(c.createTime)}
                      </td>

                      {/* 操作菜单 */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c);
                              setIsDetailOpen(true);
                            }}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs font-medium transition-colors cursor-pointer"
                          >
                            查看
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c);
                              setIsEditOpen(true);
                            }}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs font-medium transition-colors cursor-pointer"
                          >
                            编辑
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c);
                              setIsToggleStatusOpen(true);
                            }}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                              isEnabled
                                ? 'text-rose-600 hover:bg-rose-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {isEnabled ? '停用' : '恢复'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c);
                              setIsResetPasswordOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="重置管理员密码"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 弹窗组件挂载 */}
      <CreateCompanyDrawer
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      <CompanyDetailModal
        company={selectedCompany}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onOpenEdit={(c) => {
          setSelectedCompany(c);
          setIsEditOpen(true);
        }}
        onOpenToggleStatus={(c) => {
          setSelectedCompany(c);
          setIsToggleStatusOpen(true);
        }}
        onOpenResetPassword={(c) => {
          setSelectedCompany(c);
          setIsResetPasswordOpen(true);
        }}
      />

      <EditCompanyModal
        company={selectedCompany}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSuccess={handleUpdateSuccess}
      />

      <DisableCompanyModal
        company={selectedCompany}
        isOpen={isToggleStatusOpen}
        onClose={() => setIsToggleStatusOpen(false)}
        onSuccess={handleStatusChangeSuccess}
      />

      <ResetPasswordModal
        company={selectedCompany}
        isOpen={isResetPasswordOpen}
        onClose={() => setIsResetPasswordOpen(false)}
        onSuccess={handleResetPasswordSuccess}
      />
    </div>
  );
};
