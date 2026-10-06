import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { getEnvironmentConfig } from '../../services/env';
import { Company, OverviewData } from '../../types';
import { ConnectionErrorState } from '../common/ConnectionErrorState';

interface OverviewViewProps {
  onNavigateToCompanies: () => void;
  onNavigateToResources: () => void;
  onOpenCreateCompany: () => void;
  onOpenEnvModal: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onNavigateToCompanies,
  onNavigateToResources,
  onOpenCreateCompany,
  onOpenEnvModal,
}) => {
  const envConfig = getEnvironmentConfig();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getOverview();
      setData(res);
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message || '获取概览数据失败');
      } else {
        setError('数据请求异常');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            运营概览
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            入驻企业规模统计与最新开通动向
          </p>
        </div>

        <ConnectionErrorState
          activeUrl={envConfig.activeUrl}
          onRetry={fetchOverview}
          onOpenEnvModal={onOpenEnvModal}
          title="概览接口服务未就绪"
          description={error}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部标题与刷新 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            运营概览
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            DUDU 平台全局企业规模与开通运维态势
          </p>
        </div>

        <button
          type="button"
          onClick={fetchOverview}
          className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          title="刷新概览"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#F2785C]' : ''}`} />
        </button>
      </div>

      {/* 核心指标卡片组 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 企业总数 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">已入驻企业总数</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {loading ? '-' : data?.totalCompanies ?? 0}
            </span>
            <span className="text-xs text-slate-400">家企业</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">包含全部运营企业</span>
            <button
              type="button"
              onClick={onNavigateToCompanies}
              className="text-[#F2785C] hover:text-[#E06448] font-medium flex items-center gap-0.5 cursor-pointer"
            >
              查看列表
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 正常启用 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">正常服务中</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-950 tabular-nums">
              {loading ? '-' : data?.enabledCompanies ?? 0}
            </span>
            <span className="text-xs text-emerald-700">家启用</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>坐席与通道接入正常</span>
            <span className="font-mono text-slate-600">
              {data && data.totalCompanies > 0
                ? `${Math.round((data.enabledCompanies / data.totalCompanies) * 100)}%`
                : '100%'}
            </span>
          </div>
        </div>

        {/* 已停用 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800">暂停服务 / 停用</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-950 tabular-nums">
              {loading ? '-' : data?.disabledCompanies ?? 0}
            </span>
            <span className="text-xs text-rose-700">家停用</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>访问与接待已挂起</span>
            <span className="text-slate-500">可随时按需恢复</span>
          </div>
        </div>
      </div>

      {/* 快捷引导横幅 */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#F2785C] text-white text-[10px] font-bold uppercase tracking-wider">
              开通新客户
            </span>
            <h3 className="text-sm font-bold">快速创建并交付企业管理员账号</h3>
          </div>
          <p className="text-xs text-slate-300">
            支持六位企业 ID 随机查重与手动检测，开通后企业管理员即可登录 Desk 与 Console 进行业务部署。
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreateCompany}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4 text-[#F2785C]" />
          立即开通企业
        </button>
      </div>

      {/* 下方两栏：近期开通记录 + 平台规范说明 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 近期开通企业 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#F2785C]" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                最近开通企业
              </h3>
            </div>
            <button
              type="button"
              onClick={onNavigateToCompanies}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 cursor-pointer"
            >
              全部企业
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400">正在获取最新企业记录...</div>
            ) : !data?.recentCompanies || data.recentCompanies.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                暂无近期开通记录
              </div>
            ) : (
              data.recentCompanies.slice(0, 5).map((comp: Company) => (
                <div
                  key={comp.companyId}
                  className="py-3 flex items-center justify-between hover:bg-slate-50/60 rounded-lg px-2 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">
                        {comp.companyName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                        {comp.companyId}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      联系人: {comp.contactName || '未填'} · {comp.contactInfo || '未填'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        comp.status === 'enabled'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {comp.status === 'enabled' ? '正常启用' : '已停用'}
                    </span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {formatDate(comp.createTime)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 平台分工与资源边界卡片 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                产品架构与分工
              </h3>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-900 block mb-0.5">DuduAdmin (当前系统)</span>
                面向运营方平台管理员，负责企业入驻开通、六位企业编号分配、企业启停控制与审计。
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-900 block mb-0.5">DuduConsole</span>
                面向企业管理员，负责企业内部员工账号、接待分组、多渠道账号绑定与规则配置。
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-900 block mb-0.5">DuduDesk</span>
                面向企业一线客服坐席，提供各渠道会话接待、实时收发及访客跟进。
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToResources}
            className="w-full mt-2 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>检视全平台企业资源汇总</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
