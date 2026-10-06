/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LoginView } from './components/auth/LoginView';
import { AdminLayout, ActiveNavKey } from './components/layout/AdminLayout';
import { CompanyListView } from './components/companies/CompanyListView';
import { OverviewView } from './components/overview/OverviewView';
import { ResourceSummaryView } from './components/resources/ResourceSummaryView';
import { OperationLogsView } from './components/logs/OperationLogsView';
import { PersonalAccountView } from './components/account/PersonalAccountView';
import { getStoredToken, getStoredUser, clearAuthSession } from './services/api';
import { onEnvironmentChange } from './services/env';
import { AuthSession, User } from './types';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const token = getStoredToken();
    const user = getStoredUser();
    if (token && user) {
      return { token, user };
    }
    return null;
  });

  const [activeNav, setActiveNav] = useState<ActiveNavKey>('companies');
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);

  // 监听开发环境切换：自动退出到登录页
  useEffect(() => {
    const unsubscribe = onEnvironmentChange(() => {
      setSession(null);
    });
    return unsubscribe;
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    setSession(null);
  };

  const handleLoginSuccess = (newSession: AuthSession) => {
    setSession(newSession);
  };

  // 未登录状态展示独立登录界面
  if (!session) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <AdminLayout
      activeKey={activeNav}
      onSelectNav={setActiveNav}
      currentUser={session.user}
      onLogout={handleLogout}
      onOpenEnvModal={() => setIsEnvModalOpen(true)}
      isEnvModalOpen={isEnvModalOpen}
      onCloseEnvModal={() => setIsEnvModalOpen(false)}
    >
      {activeNav === 'overview' && (
        <OverviewView
          onNavigateToCompanies={() => setActiveNav('companies')}
          onNavigateToResources={() => setActiveNav('resources')}
          onOpenCreateCompany={() => setActiveNav('companies')}
          onOpenEnvModal={() => setIsEnvModalOpen(true)}
        />
      )}

      {activeNav === 'companies' && (
        <CompanyListView onOpenEnvModal={() => setIsEnvModalOpen(true)} />
      )}

      {activeNav === 'resources' && (
        <ResourceSummaryView onOpenEnvModal={() => setIsEnvModalOpen(true)} />
      )}

      {activeNav === 'logs' && (
        <OperationLogsView onOpenEnvModal={() => setIsEnvModalOpen(true)} />
      )}

      {activeNav === 'account' && (
        <PersonalAccountView currentUser={session.user} />
      )}
    </AdminLayout>
  );
}
