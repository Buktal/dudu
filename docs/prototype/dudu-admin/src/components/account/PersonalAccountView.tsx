import React, { useState } from 'react';
import {
  Shield,
  User,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { adminApi, ApiConnectionError } from '../../services/api';
import { User as UserType } from '../../types';

interface PersonalAccountViewProps {
  currentUser: UserType | null;
}

export const PersonalAccountView: React.FC<PersonalAccountViewProps> = ({ currentUser }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!currentPassword) {
      setErrorMsg('请输入当前密码');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('新密码长度不能少于 6 位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的新密码不一致');
      return;
    }

    setLoading(true);

    try {
      await adminApi.changePassword(currentPassword, newPassword);
      setSuccessMsg('登录密码修改成功，新密码即刻生效');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError) {
        setErrorMsg(`服务连接失败：${err.message}`);
      } else if (err instanceof Error) {
        setErrorMsg(err.message || '修改密码失败');
      } else {
        setErrorMsg('操作异常');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
          个人账号
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          平台管理员身份与安全凭据管理
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 左侧：账号基本资料 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg font-mono">
              {currentUser?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {currentUser?.username || 'Admin'}
              </h3>
              <span className="text-[11px] font-semibold text-[#F2785C] bg-[#FFF0EB] px-2 py-0.5 rounded-full inline-block mt-0.5">
                平台超级管理员
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                账号主体
              </span>
              <span className="font-semibold text-slate-800">
                {currentUser?.name || '运营总管'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                授权角色
              </span>
              <span className="font-mono text-slate-700">platform_admin</span>
            </div>

            <div className="flex items-center justify-between text-slate-600">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                账号范围
              </span>
              <span className="text-emerald-700 font-medium">全平台运营</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
            平台管理员账号独立于任何企业租户，具备创建企业、分配六位企业编号与运维全局数据的权限。
          </div>
        </div>

        {/* 右侧：修改登录密码 */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#F2785C]" />
            <h3 className="text-sm font-bold text-slate-900">修改平台登录密码</h3>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">当前密码 *</label>
              <div className="relative max-w-md">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="请输入当前生效的密码"
                  required
                  className="w-full pl-3.5 pr-9 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">新密码 *</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="不少于 6 位"
                    required
                    minLength={6}
                    className="w-full pl-3.5 pr-9 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">确认新密码 *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="重复输入新密码"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F2785C]" />
                    提交修改中...
                  </>
                ) : (
                  '更新密码'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
