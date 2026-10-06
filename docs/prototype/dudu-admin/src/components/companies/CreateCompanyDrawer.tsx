import React, { useState } from 'react';
import {
  X,
  Dices,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Building2,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { adminApi, ApiBusinessError, ApiConnectionError } from '../../services/api';
import { Company, CreateCompanyPayload } from '../../types';

interface CreateCompanyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCompany: Company) => void;
}

type IdStatus = 'idle' | 'checking' | 'available' | 'occupied' | 'error';

export const CreateCompanyDrawer: React.FC<CreateCompanyDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  // 企业基本表单
  const [companyId, setCompanyId] = useState('');
  const [idStatus, setIdStatus] = useState<IdStatus>('idle');
  const [idErrorMessage, setIdErrorMessage] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [remark, setRemark] = useState('');

  // 初始企业管理员
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 提交状态与错误
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 校验 6 位企业 ID 格式 (100000 - 999999)
  const validateIdFormat = (id: string): boolean => {
    if (!/^\d{6}$/.test(id)) return false;
    const num = parseInt(id, 10);
    return num >= 100000 && num <= 999999;
  };

  // 手动修改企业 ID 时重置校验状态
  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCompanyId(val);
    setIdStatus('idle');
    setIdErrorMessage(null);
  };

  // 点击「随机生成」：由后端查重后返回未占用的 6 位 ID
  const handleGenerateRandomId = async () => {
    setIdStatus('checking');
    setIdErrorMessage(null);
    setFormError(null);
    try {
      const res = await adminApi.generateCompanyId();
      if (res && res.companyId) {
        setCompanyId(res.companyId);
        setIdStatus('available');
      } else {
        setIdStatus('error');
        setIdErrorMessage('未获取到有效企业 ID');
      }
    } catch (err: unknown) {
      setIdStatus('error');
      if (err instanceof ApiConnectionError) {
        setIdErrorMessage('连接服务失败，无法生成 ID');
      } else if (err instanceof Error) {
        setIdErrorMessage(err.message || '生成失败');
      } else {
        setIdErrorMessage('生成失败');
      }
    }
  };

  // 点击「检测」：调用后端检查手动输入的 6 位 ID 是否被占用
  const handleCheckIdAvailability = async () => {
    if (!validateIdFormat(companyId)) {
      setIdStatus('error');
      setIdErrorMessage('企业 ID 必须为 100000 至 999999 的 6 位数字');
      return;
    }

    setIdStatus('checking');
    setIdErrorMessage(null);
    setFormError(null);

    try {
      const res = await adminApi.checkCompanyIdAvailability(companyId);
      if (res.available) {
        setIdStatus('available');
      } else {
        setIdStatus('occupied');
      }
    } catch (err: unknown) {
      setIdStatus('error');
      if (err instanceof ApiConnectionError) {
        setIdErrorMessage('无法连接至后端，请重试');
      } else if (err instanceof Error) {
        setIdErrorMessage(err.message || '检测失败');
      } else {
        setIdErrorMessage('检测失败');
      }
    }
  };

  // 提交创建企业与初始管理员
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validateIdFormat(companyId)) {
      setFormError('企业 ID 格式错误，必须为 6 位数字 (100000-999999)');
      return;
    }

    if (idStatus !== 'available') {
      setFormError('请先检测企业 ID 并确认「当前可用」');
      return;
    }

    if (!companyName.trim()) {
      setFormError('请输入企业名称');
      return;
    }

    if (!adminUsername.trim()) {
      setFormError('请输入初始企业管理员登录名');
      return;
    }

    if (!adminPassword.trim() || adminPassword.length < 6) {
      setFormError('初始管理员密码不能少于 6 位');
      return;
    }

    setSubmitting(true);

    const payload: CreateCompanyPayload = {
      companyId,
      companyName: companyName.trim(),
      contactName: contactName.trim() || null,
      contactInfo: contactInfo.trim() || null,
      remark: remark.trim() || null,
      initialAdmin: {
        username: adminUsername.trim(),
        password: adminPassword,
      },
    };

    try {
      const createdCompany = await adminApi.createCompany(payload);
      onSuccess(createdCompany);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiBusinessError && (err.code === 409 || err.message.includes('占用'))) {
        // ID 并发占用冲突：保留其他字段，清除 ID 可用状态，允许重新选择
        setIdStatus('occupied');
        setFormError('该企业 ID 在提交前已被占用，请点击「随机生成」或更换其他 ID 检测后重新提交');
      } else if (err instanceof ApiConnectionError) {
        setFormError(`服务连接失败：${err.message}`);
      } else if (err instanceof Error) {
        setFormError(err.message || '创建企业失败');
      } else {
        setFormError('创建企业请求失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* 抽屉头部 */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FFF0EB] text-[#F2785C] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">创建企业</h2>
              <p className="text-xs text-slate-500">
                录入企业基础档案，并同步初始化企业管理员账号
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

        {/* 表单内容区 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 第一部分：企业核心身份 (ID) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <span>企业 ID</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">固定 6 位数字，开通后不可修改</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={companyId}
                  onChange={handleIdChange}
                  placeholder="例如 582713"
                  maxLength={6}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-mono tracking-wider font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
              </div>

              {/* 随机生成按钮 */}
              <button
                type="button"
                onClick={handleGenerateRandomId}
                disabled={idStatus === 'checking'}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                title="后端生成并查重未被占用的 6 位企业 ID"
              >
                <Dices className="w-4 h-4 text-slate-600" />
                随机生成
              </button>

              {/* 手动检测按钮 */}
              <button
                type="button"
                onClick={handleCheckIdAvailability}
                disabled={!companyId || idStatus === 'checking'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {idStatus === 'checking' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                检测
              </button>
            </div>

            {/* 检测状态结果反馈 */}
            <div className="min-h-5 text-xs">
              {idStatus === 'checking' && (
                <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F2785C]" />
                  <span>正在检测企业 ID 可用性...</span>
                </div>
              )}

              {idStatus === 'available' && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-emerald-600 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>当前可用</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-5">
                    提交创建时后端将进行最终主键事务校验
                  </p>
                </div>
              )}

              {idStatus === 'occupied' && (
                <div className="flex items-center gap-1.5 text-rose-600 font-medium text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  <span>该企业 ID 已被占用，请更换其他号码</span>
                </div>
              )}

              {idStatus === 'error' && (
                <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>{idErrorMessage || '检测失败，请重试'}</span>
                </div>
              )}
            </div>
          </div>

          {/* 第二部分：企业基本档案 */}
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-900 flex items-center gap-1">
                <span>企业名称</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="例如：云川网络科技有限公司"
                maxLength={100}
                required
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">业务联系人</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="例如：张主管"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">联系方式</label>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="手机号 / 邮箱 / 座机"
                  maxLength={200}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">运营备注</label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
                placeholder="仅运营方可见的企业备注信息（可选）"
                maxLength={1000}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
              />
            </div>
          </div>

          {/* 第三部分：初始企业管理员 (共同创建) */}
          <div className="pt-3 border-t border-slate-200/80 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#F2785C]" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                初始企业管理员凭据
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed -mt-2">
              企业创建成功时同步初始化此管理员账号。企业内部管理员通过「企业 ID + 登录名 + 密码」登录 Desk / Console。
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>管理员登录名</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  required
                  maxLength={64}
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
                <span className="text-[10px] text-slate-400">企业内唯一，跨企业可同名</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>初始登录密码</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="不少于 6 位"
                    required
                    minLength={6}
                    className="w-full pl-3.5 pr-9 py-2.5 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400">密码仅传输哈希，开通后不再明文返回</span>
              </div>
            </div>
          </div>
        </form>

        {/* 底部固定操作栏 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>企业与初始管理员为不可分割的原子事务</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || idStatus !== 'available'}
              className="px-5 py-2 text-xs font-medium text-white bg-[#F2785C] hover:bg-[#E06448] rounded-lg shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>开通中...</span>
                </>
              ) : (
                <span>确认开通企业</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
