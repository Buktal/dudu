import React, { useState, useEffect } from 'react';
import { X, Building2, AlertCircle, Loader2 } from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { Company, UpdateCompanyPayload } from '../../types';

interface EditCompanyModalProps {
  company: Company | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedCompany: Company) => void;
}

export const EditCompanyModal: React.FC<EditCompanyModalProps> = ({
  company,
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !company) return null;

  const [companyName, setCompanyName] = useState(company.companyName);
  const [contactName, setContactName] = useState(company.contactName || '');
  const [contactInfo, setContactInfo] = useState(company.contactInfo || '');
  const [remark, setRemark] = useState(company.remark || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (company) {
      setCompanyName(company.companyName);
      setContactName(company.contactName || '');
      setContactInfo(company.contactInfo || '');
      setRemark(company.remark || '');
      setError(null);
    }
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('企业名称不能为空');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: UpdateCompanyPayload = {
      companyName: companyName.trim(),
      contactName: contactName.trim() || null,
      contactInfo: contactInfo.trim() || null,
      remark: remark.trim() || null,
    };

    try {
      const updated = await adminApi.updateCompany(company.companyId, payload);
      onSuccess(updated);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setError(`连接服务失败：${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message || '更新企业资料失败');
      } else {
        setError('更新企业资料失败');
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
            <div className="w-8 h-8 rounded-lg bg-[#FFF0EB] text-[#F2785C] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">编辑企业资料</h3>
              <p className="text-xs text-slate-500 font-mono">
                企业 ID: <span className="font-semibold text-slate-800">{company.companyId}</span>（只读）
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

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-900 flex items-center gap-1">
              <span>企业名称</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">业务联系人</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={100}
                placeholder="留空即清空"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">联系方式</label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                maxLength={200}
                placeholder="留空即清空"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">运营备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="运营方内部备注"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
            />
          </div>

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
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>保存修改</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
