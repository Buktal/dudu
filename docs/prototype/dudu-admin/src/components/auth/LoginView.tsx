import React, { useState } from 'react';
import { Lock, User, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { DuDuLogo } from '../brand/DuDuLogo';
import { adminApi } from '../../services/api';
import { AuthSession } from '../../types';

interface LoginViewProps {
  onLoginSuccess: (session: AuthSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('Admin');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (userToLogin = username) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const session = await adminApi.login(userToLogin.trim() || 'Admin', password);
      onLoginSuccess(session);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message || '登录异常');
      } else {
        setErrorMessage('登录请求异常');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative selection:bg-[#FFF0EB] selection:text-[#F2785C]">
      {/* 顶部导航条 */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <DuDuLogo size="md" />

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>前端 Demo 模拟就绪</span>
          </span>
        </div>
      </header>

      {/* 登录卡片居中 */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 p-8 shadow-sm space-y-6">
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
              平台管理员登录
            </h1>
            <p className="text-xs text-slate-500">
              DuDu 运营方后台 · 纯前端模拟演示 Demo
            </p>
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              <strong>免后端运行中：</strong>当前已启用前端模拟 Demo 模式，包含企业开通、六位企业 ID 查重、启停、改密、运营概览与操作记录等完整交互，点击下方按钮直接进入。
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">平台管理员账号</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入平台管理员登录名"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">登录密码</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入平台管理员密码"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50/50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#F2785C] hover:bg-[#E06448] text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在进入后台...</span>
                </>
              ) : (
                <>
                  <span>直接进入运营后台 (Demo)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 text-center">
            <span>预填默认凭据为 Admin / Admin · 点击按钮即可直接进入体验</span>
          </div>
        </div>
      </main>

      {/* 底部版权 */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-4 text-center text-xs text-slate-400">
        <span>DuDu Admin · 平台运营中心前端演示 Demo</span>
      </footer>
    </div>
  );
};
