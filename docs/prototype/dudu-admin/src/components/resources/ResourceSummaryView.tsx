import React, { useState, useEffect } from 'react';
import {
  Layers,
  Users,
  FolderKanban,
  Radio,
  Info,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { getEnvironmentConfig } from '../../services/env';
import { ResourceSummaryData } from '../../types';
import { ConnectionErrorState } from '../common/ConnectionErrorState';

interface ResourceSummaryViewProps {
  onOpenEnvModal: () => void;
}

export const ResourceSummaryView: React.FC<ResourceSummaryViewProps> = ({
  onOpenEnvModal,
}) => {
  const envConfig = getEnvironmentConfig();
  const [data, setData] = useState<ResourceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getResourceSummary();
      setData(res);
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message || '获取资源汇总失败');
      } else {
        setError('请求异常');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            企业资源汇总
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            各企业员工规模、接待组与渠道接入总数只读检视
          </p>
        </div>

        <ConnectionErrorState
          activeUrl={envConfig.activeUrl}
          onRetry={fetchResources}
          onOpenEnvModal={onOpenEnvModal}
          title="资源统计接口未就绪"
          description={error}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部标题与说明 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            企业资源汇总
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            全平台企业员工、接待分组与渠道接入账号数量与状态汇总（只读）
          </p>
        </div>

        <button
          type="button"
          onClick={fetchResources}
          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          title="刷新资源汇总"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F2785C]' : ''}`} />
        </button>
      </div>

      {/* 边界提示条 */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <span className="font-semibold text-blue-950">运营方分工原则：</span>
          <span className="text-blue-800">
            DuduAdmin 仅提供各企业资源用量的只读聚合统计，不介入企业内部员工增删、接待组编排或渠道凭据绑定。各企业的内部运维由其企业管理员在 <strong>DuduConsole</strong> 自行管理。
          </span>
        </div>
      </div>

      {/* 统计指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>服务企业总数</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {loading ? '-' : data?.totalCompanies ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">全局入驻法人主体</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>注册员工总数</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {loading ? '-' : data?.totalEmployees ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">包含企业管理员与坐席</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>接待技能组</span>
            <FolderKanban className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {loading ? '-' : data?.totalReceptionGroups ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">跨业务平级分组</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>渠道接入账号</span>
            <Radio className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {loading ? '-' : data?.totalChannelAccounts ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">对外服务接入点</div>
        </div>
      </div>

      {/* 企业资源清单表格 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            各企业资源用量明细
          </h3>
          <span className="text-[11px] text-slate-400">数据源：后端实时聚合计算</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4 w-56">企业名称</th>
                <th className="py-3 px-4 w-28 font-mono">企业 ID</th>
                <th className="py-3 px-4 w-24">运行状态</th>
                <th className="py-3 px-4 text-right w-28">员工数量</th>
                <th className="py-3 px-4 text-right w-28">接待组数</th>
                <th className="py-3 px-4 text-right w-28">渠道账号</th>
                <th className="py-3 px-4 text-right">数据刷新</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-12" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-8 ml-auto" /></td>
                    <td className="py-3.5 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : !data?.companies || data.companies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    暂无企业资源统计数据
                  </td>
                </tr>
              ) : (
                data.companies.map((item) => (
                  <tr key={item.companyId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {item.companyName}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 tabular-nums">
                      {item.companyId}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          item.status === 'enabled'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {item.status === 'enabled' ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-800 tabular-nums">
                      {item.employeeCount} 人
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-800 tabular-nums">
                      {item.receptionGroupCount} 个
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-800 tabular-nums">
                      {item.channelAccountCount} 个
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                      刚刚
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
