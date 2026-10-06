/**
 * DuduAdmin 接口环境服务
 * 契约规范：docs/design/dudu-admin/api-environments.md
 * 
 * 规则：
 * 1. 仅在开发模式 (import.meta.env.DEV) 允许查看与切换环境、修改本地地址。
 * 2. 生产构建强制使用线上固定地址，忽略任何本地存储或参数覆盖。
 * 3. 地址格式为源地址 (协议://主机:端口)，不带 /api，末尾无斜杠。
 * 4. 切换环境时发布事件，通知清理旧令牌、取消进行中请求并回到登录页。
 */

import { EnvType, EnvironmentConfig } from '../types';

const STORAGE_KEY_ENV_TYPE = 'dudu_admin_env_type';
const STORAGE_KEY_LOCAL_URL = 'dudu_admin_local_url';
const STORAGE_KEY_ONLINE_URL = 'dudu_admin_online_url';

export const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8080';
export const DEFAULT_ONLINE_URL = (import.meta.env.VITE_API_URL as string) || 'https://api.dudu.example';

// 仅在 Vite 开发模式下启用环境切换
export const IS_DEV = import.meta.env.DEV;

type EnvChangeListener = (config: EnvironmentConfig) => void;
const listeners: Set<EnvChangeListener> = new Set();

/**
 * 校验并规范化 HTTP/HTTPS 源地址
 */
export function sanitizeOriginUrl(rawUrl: string): { valid: boolean; url: string; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, url: '', error: '请输入有效的服务地址' };
  }
  
  const trimmed = rawUrl.trim().replace(/\/+$/, ''); // 去掉末尾斜杠
  
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, url: '', error: '仅支持 http:// 或 https:// 协议' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, url: '', error: '地址不能包含账号或密码' };
    }
    // 只保留协议与主机端口 (origin)
    return { valid: true, url: parsed.origin };
  } catch {
    return { valid: false, url: '', error: '地址格式不合法，例如 http://127.0.0.1:8080' };
  }
}

/**
 * 获取当前环境配置
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  if (!IS_DEV) {
    // 生产环境：固定使用发布配置中的线上地址，禁止开发配置覆盖
    return {
      type: 'online',
      localUrl: DEFAULT_LOCAL_URL,
      onlineUrl: DEFAULT_ONLINE_URL,
      activeUrl: DEFAULT_ONLINE_URL,
      isDev: false,
    };
  }

  // 开发环境：从 localStorage 获取保存的配置
  let savedType: EnvType = 'mock'; // 默认提供内置演示沙箱，确保无真实后端时可完整查看和操作
  try {
    const rawType = localStorage.getItem(STORAGE_KEY_ENV_TYPE);
    if (rawType === 'online' || rawType === 'local' || rawType === 'mock') {
      savedType = rawType;
    }
  } catch {
    // localStorage 不可用时退化
  }

  let localUrl = DEFAULT_LOCAL_URL;
  try {
    const rawLocal = localStorage.getItem(STORAGE_KEY_LOCAL_URL);
    if (rawLocal) {
      const sanitized = sanitizeOriginUrl(rawLocal);
      if (sanitized.valid) {
        localUrl = sanitized.url;
      }
    }
  } catch {
    // ignore
  }

  const onlineUrl = DEFAULT_ONLINE_URL;
  const activeUrl = savedType === 'mock' 
    ? '内置演示环境 (Mock)' 
    : savedType === 'local' 
      ? localUrl 
      : onlineUrl;

  return {
    type: savedType,
    localUrl,
    onlineUrl,
    activeUrl,
    isDev: true,
  };
}

/**
 * 设置开发环境配置（仅在开发模式有效）
 */
export function setEnvironmentConfig(newType: EnvType, customLocalUrl?: string): boolean {
  if (!IS_DEV) {
    console.warn('[DuduAdmin] 生产环境不支持修改接口环境');
    return false;
  }

  let validLocalUrl = DEFAULT_LOCAL_URL;
  if (customLocalUrl) {
    const check = sanitizeOriginUrl(customLocalUrl);
    if (!check.valid) {
      throw new Error(check.error || '无效的本地服务地址');
    }
    validLocalUrl = check.url;
  } else {
    // 继承既有配置
    const current = getEnvironmentConfig();
    validLocalUrl = current.localUrl;
  }

  try {
    localStorage.setItem(STORAGE_KEY_ENV_TYPE, newType);
    localStorage.setItem(STORAGE_KEY_LOCAL_URL, validLocalUrl);
  } catch {
    // ignore
  }

  const newConfig = getEnvironmentConfig();
  // 通知所有监听器 (触发取消请求、清理令牌并回退至登录页)
  listeners.forEach(fn => fn(newConfig));
  return true;
}

/**
 * 监听环境切换事件
 */
export function onEnvironmentChange(listener: EnvChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 获取当前接口基础地址 (不带 /api，末尾无斜杠)
 */
export function getActiveApiBaseUrl(): string {
  return getEnvironmentConfig().activeUrl;
}
