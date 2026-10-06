import React from 'react';
import { AlertCircle, RefreshCw, Settings2 } from 'lucide-react';
import { IS_DEV } from '../../services/env';

interface ConnectionErrorBannerProps {
  targetUrl: string;
  errorMessage?: string;
  onRetry: () => void;
  onOpenEnvSettings?: () => void;
}

export const ConnectionErrorBanner: React.FC<ConnectionErrorBannerProps> = ({
  targetUrl,
  errorMessage,
  onRetry,
  onOpenEnvSettings,
}) => {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 shadow-xs">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <div className="font-semibold text-rose-950 flex items-center justify-between">
            <span>后端服务连接失败</span>
          </div>
          <p className="text-rose-800 text-xs leading-relaxed">
            无法连接至目标接口服务{' '}
            <code className="px-1.5 py-0.5 bg-rose-100/80 text-rose-950 rounded font-mono text-[11px] font-semibold break-all">
              {targetUrl}
            </code>
            。请检查后端 Spring Boot 服务是否已启动且端口正常监听。
          </p>
          {errorMessage && (
            <p className="text-[11px] text-rose-700/90 font-mono break-all pt-0.5">
              错误信息: {errorMessage}
            </p>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-md text-xs font-medium hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重新尝试连接
            </button>

            {IS_DEV && onOpenEnvSettings && (
              <button
                type="button"
                onClick={onOpenEnvSettings}
                className="inline-flex items-center gap-1 text-xs text-rose-900 font-medium hover:underline cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
                调整开发环境地址
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
