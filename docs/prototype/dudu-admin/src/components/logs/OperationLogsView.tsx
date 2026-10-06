import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { getEnvironmentConfig } from '../../services/env';
import { OperationLog } from '../../types';
import { ConnectionErrorState } from '../common/ConnectionErrorState';

interface OperationLogsViewProps {
  onOpenEnvModal: () => void;
}

export const OperationLogsView: React.FC<OperationLogsViewProps> = ({ onOpenEnvModal }) => {
  const envConfig = getEnvironmentConfig();

  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getOperationLogs({
        page,
        size: pageSize,
        search: searchQuery.trim() || undefined,
        action: actionFilter === 'all' ? undefined : actionFilter,
        result: resultFilter === 'all' ? undefined : resultFilter,
      });
      setLogs(res.list || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message || '获取操作记录失败');
      } else {
        setError('数据异常');
      }
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, actionFilter, resultFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getActionLabel = (action: string) => {
    const map: Record<string, string> = {
      create_company: '创建企业',
      update_company: '编辑企业资料',
      disable_company: '停用企业',
      enable_company: '恢复企业',
      reset_admin_password: '重置管理员密码',
      change_self_password: '平台自身改密',
    };
    return map[action] || action;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="space-y-5">
      {/* 顶部标题与描述 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            操作记录
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            审计平台管理员对企业开通、资料维护、启停及密码重置的全局痕迹
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          title="刷新记录"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F2785C]' : ''}`} />
        </button>
      </div>

      {/* 搜索与筛选工具栏 */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索操作对象、说明或企业 ID"
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C] transition-all"
          />
        </form>

        <div className="flex items-center gap-2">
          {/* 动作类型筛选 */}
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 cursor-pointer"
          >
            <option value="all">全部操作类型</option>
            <option value="create_company">创建企业</option>
            <option value="update_company">编辑企业资料</option>
            <option value="disable_company">停用企业</option>
            <option value="enable_company">恢复企业</option>
            <option value="reset_admin_password">重置管理员密码</option>
            <option value="change_self_password">平台自身改密</option>
          </select>

          {/* 结果状态筛选 */}
          <select
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 cursor-pointer"
          >
            <option value="all">全部结果</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </select>
        </div>
      </div>

      {/* 表格内容或连接错误提示 */}
      {error ? (
        <ConnectionErrorState
          activeUrl={envConfig.activeUrl}
          onRetry={fetchLogs}
          onOpenEnvModal={onOpenEnvModal}
          title="审计日志服务未就绪"
          description={error}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-3 px-4 w-44 font-mono">操作时间</th>
                  <th className="py-3 px-4 w-28">操作者</th>
                  <th className="py-3 px-4 w-32">操作类型</th>
                  <th className="py-3 px-4 w-28 font-mono">目标 ID</th>
                  <th className="py-3 px-4 w-20">结果</th>
                  <th className="py-3 px-4">操作摘要</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-28" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-14" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-10" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-48" /></td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-2 text-slate-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-medium text-slate-600">暂无操作日志记录</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        运营平台的所有开通与运维修改将自动审计留痕
                      </p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.operationLogId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 tabular-nums">
                        {formatDate(log.createTime)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {log.operatorUsername}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <span className="font-medium">{getActionLabel(log.action)}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 tabular-nums">
                        {log.targetId || '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            log.result === 'success' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {log.result === 'success' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          )}
                          {log.result === 'success' ? '成功' : '失败'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="line-clamp-1">{log.summary || '-'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 分页控制 */}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              共 <span className="font-semibold text-slate-800 tabular-nums">{total}</span> 条审计记录
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
