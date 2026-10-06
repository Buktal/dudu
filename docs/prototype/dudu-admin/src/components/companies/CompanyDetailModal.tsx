import React from 'react';
import {
  X,
  Building2,
  Calendar,
  User,
  Phone,
  FileText,
  ShieldCheck,
  Edit,
  Power,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import { Company } from '../../types';

interface CompanyDetailModalProps {
  company: Company | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenEdit: (company: Company) => void;
  onOpenToggleStatus: (company: Company) => void;
  onOpenResetPassword: (company: Company) => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  company,
  isOpen,
  onClose,
  onOpenEdit,
  onOpenToggleStatus,
  onOpenResetPassword,
}) => {
  if (!isOpen || !company) return null;

  const isEnabled = company.status === 'enabled';

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

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FFF0EB] text-[#F2785C] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{company.companyName}</h3>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isEnabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {isEnabled ? '正常启用' : '已停用'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                企业 ID: <span className="font-semibold text-slate-800">{company.companyId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 详细信息内容 */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* 停用原因警示 */}
          {!isEnabled && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">该企业当前处于停用状态</p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  停用原因：{company.disableReason || '无记录原因'}
                </p>
                <p className="text-[10px] text-rose-600 mt-1">
                  企业员工已无法登录 Desk/Console，渠道接待通道已挂起。
                </p>
              </div>
            </div>
          )}

          {/* 企业基本信息网格 */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              基础档案
            </h4>
            <div className="grid grid-cols-2 gap-3.5 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                  <User className="w-3.5 h-3.5" />
                  业务联系人
                </span>
                <span className="font-medium text-slate-800 block text-xs">
                  {company.contactName || '未填写'}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                  <Phone className="w-3.5 h-3.5" />
                  联系方式
                </span>
                <span className="font-medium text-slate-800 block text-xs">
                  {company.contactInfo || '未填写'}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                  <Calendar className="w-3.5 h-3.5" />
                  创建时间
                </span>
                <span className="font-mono text-slate-800 block text-xs tabular-nums">
                  {formatDate(company.createTime)}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 flex items-center gap-1.5 text-[11px]">
                  <Calendar className="w-3.5 h-3.5" />
                  最近修改
                </span>
                <span className="font-mono text-slate-800 block text-xs tabular-nums">
                  {formatDate(company.updateTime)}
                </span>
              </div>
            </div>
          </div>

          {/* 运营备注 */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              运营备注
            </h4>
            <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-slate-700 min-h-[48px] leading-relaxed">
              {company.remark || <span className="text-slate-400 italic">暂无运营备注</span>}
            </div>
          </div>

          {/* 初始企业管理员凭据说明 */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#F2785C]" />
              企业管理员账号
            </h4>
            <div className="p-3.5 bg-[#FFF0EB]/40 border border-[#F2785C]/20 rounded-xl flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 font-mono text-xs">
                    {company.initialAdminUsername || 'admin'}
                  </span>
                  <span className="text-[10px] text-slate-500">（企业主理人）</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  企业登录要素：企业编号 <span className="font-mono font-semibold text-slate-800">{company.companyId}</span> + 账号 <span className="font-mono font-semibold text-slate-800">{company.initialAdminUsername || 'admin'}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenResetPassword(company);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                重置密码
              </button>
            </div>
          </div>
        </div>

        {/* 底部操作工具栏 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenToggleStatus(company);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              isEnabled
                ? 'text-rose-700 hover:bg-rose-50 border border-rose-200'
                : 'text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {isEnabled ? '停用企业' : '恢复企业'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenEdit(company);
              }}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Edit className="w-3.5 h-3.5 text-slate-500" />
              编辑档案
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
