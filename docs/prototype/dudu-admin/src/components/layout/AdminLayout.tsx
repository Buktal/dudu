import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Layers,
  FileText,
  UserCheck,
  Server,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { DuDuLogo } from '../brand/DuDuLogo';
import { getEnvironmentConfig, IS_DEV } from '../../services/env';
import { EnvSwitcherModal } from '../env/EnvSwitcherModal';
import { User } from '../../types';

export type ActiveNavKey = 'overview' | 'companies' | 'resources' | 'logs' | 'account';

interface AdminLayoutProps {
  activeKey: ActiveNavKey;
  onSelectNav: (key: ActiveNavKey) => void;
  currentUser: User | null;
  onLogout: () => void;
  children: React.ReactNode;
  onOpenEnvModal: () => void;
  isEnvModalOpen: boolean;
  onCloseEnvModal: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeKey,
  onSelectNav,
  currentUser,
  onLogout,
  children,
  onOpenEnvModal,
  isEnvModalOpen,
  onCloseEnvModal,
}) => {
  const envConfig = getEnvironmentConfig();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ key: ActiveNavKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'overview', label: '运营概览', icon: LayoutDashboard },
    { key: 'companies', label: '企业管理', icon: Building2 },
    { key: 'resources', label: '企业资源汇总', icon: Layers },
    { key: 'logs', label: '操作记录', icon: FileText },
    { key: 'account', label: '个人账号', icon: UserCheck },
  ];

  const currentNav = navItems.find((n) => n.key === activeKey);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-800 antialiased font-sans">
      {/* 移动端顶部顶栏 */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <DuDuLogo size="sm" />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* 左侧主导航栏 (桌面端 240px) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-60 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 space-y-6">
          <div className="hidden md:block">
            <DuDuLogo size="md" />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelectNav(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#FFF0EB] text-[#F2785C] shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#F2785C]' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 侧栏底部：操作者与退出 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          {/* 开发环境简要标识 */}
          <div
            onClick={onOpenEnvModal}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 cursor-pointer transition-colors"
            title="点击查看/切换环境"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                运行状态
              </span>
              <span className="font-semibold text-emerald-800">
                前端纯 Demo 模式
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              免后端接口 · 内存交互完备
            </div>
          </div>

          {/* 账号简讯与退出 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                {currentUser?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="overflow-hidden">
                <span className="text-xs font-semibold text-slate-900 block truncate">
                  {currentUser?.username || 'Admin'}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">平台管理员</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 右侧主视口 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部工具栏 (Zone 1: 面包屑 / Zone 2: 状态环境 / Zone 3: 个人与退出) */}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
          {/* Zone 1: 面包屑与当前路径 */}
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="hover:text-slate-700 cursor-pointer" onClick={() => onSelectNav('overview')}>
              DuDu 运营中心
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 font-semibold">{currentNav?.label || '企业管理'}</span>
          </div>

          {/* Zone 2 & 3: 环境指示器与操作 */}
          <div className="flex items-center gap-3">
            {/* 顶栏环境指示按钮 */}
            <button
              type="button"
              onClick={onOpenEnvModal}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>纯前端演示 Demo</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>退出</span>
            </button>
          </div>
        </header>

        {/* 主视口主体容器 */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>

      {/* 全局环境切换弹窗 */}
      <EnvSwitcherModal
        isOpen={isEnvModalOpen}
        onClose={onCloseEnvModal}
        onEnvironmentSwitched={() => {
          onLogout();
        }}
      />
    </div>
  );
};
