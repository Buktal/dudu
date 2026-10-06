import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { Company } from '../../types';

interface DisableCompanyModalProps {
  company: Company | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DisableCompanyModal: React.FC<DisableCompanyModalProps> = ({
  company,
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !company) return null;

  const isDisabling = company.status === 'enabled';
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabling && !reason.trim()) {
      setError('请输入停用原因');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isDisabling) {
        await adminApi.disableCompany(company.companyId, reason.trim());
      } else {
        await adminApi.enableCompany(company.companyId);
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setError(`服务连接失败：${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message || '操作失败');
      } else {
        setError('操作失败');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isDisabling ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {isDisabling ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isDisabling ? '停用企业服务' : '恢复企业服务'}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {company.companyName} ({company.companyId})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体说明与原因输入 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isDisabling ? (
            <>
              <div className="p-3 bg-rose-50/80 border border-rose-200/80 rounded-xl space-y-1 text-rose-900">
                <p className="font-semibold text-xs">停用影响确认：</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                  <li>该企业所有员工（包括企业管理员）将无法登录 Desk 与 Console。</li>
                  <li>该企业已接入的渠道接待通道将立即暂停接收新会话。</li>
                  <li>系统保留该企业全部历史数据，恢复后可重新接入。</li>
                </ul>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-900 flex items-center gap-1">
                  <span>停用原因</span>
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="请输入停用原因（如：合作到期、安全违规、客户申请等）"
                  required
                  maxLength={500}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
              </div>
            </>
          ) : (
            <div className="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-xl space-y-1.5 text-emerald-950">
              <p className="font-semibold text-xs">恢复企业服务说明：</p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                恢复后，该企业管理员及员工可正常登录后台与接待台，渠道接入服务将恢复监听与接待能力。
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs ${
                isDisabling
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isDisabling ? '确认停用' : '确认恢复'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
