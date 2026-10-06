import React from 'react';
import { WifiOff, RefreshCw, Settings } from 'lucide-react';
import { IS_DEV } from '../../services/env';

interface ConnectionErrorStateProps {
  activeUrl: string;
  onRetry: () => void;
  onOpenEnvModal?: () => void;
  title?: string;
  description?: string;
}

export const ConnectionErrorState: React.FC<ConnectionErrorStateProps> = ({
  activeUrl,
  onRetry,
  onOpenEnvModal,
  title = '服务接口暂不可用',
  description,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center max-w-lg mx-auto my-8 shadow-xs">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500 mb-3">
        <WifiOff className="w-6 h-6 text-slate-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
        {description || (
          <>
            未能连接至{' '}
            <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
              {activeUrl}
            </code>
            。根据规范，系统不会展示假数据或虚构成功，请在确认服务启动后重试。
          </>
        )}
      </p>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重试请求
        </button>

        {IS_DEV && onOpenEnvModal && (
          <button
            type="button"
            onClick={onOpenEnvModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            配置开发服务地址
          </button>
        )}
      </div>
    </div>
  );
};
