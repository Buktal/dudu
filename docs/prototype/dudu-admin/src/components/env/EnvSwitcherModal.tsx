import React, { useState } from 'react';
import {
  X,
  Server,
  Globe,
  Radio,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  DEFAULT_LOCAL_URL,
  DEFAULT_ONLINE_URL,
  IS_DEV,
  getEnvironmentConfig,
  sanitizeOriginUrl,
  setEnvironmentConfig,
} from '../../services/env';
import { adminApi } from '../../services/api';
import { EnvType } from '../../types';

interface EnvSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnvironmentSwitched?: () => void;
}

export const EnvSwitcherModal: React.FC<EnvSwitcherModalProps> = ({
  isOpen,
  onClose,
  onEnvironmentSwitched,
}) => {
  if (!isOpen || !IS_DEV) return null;

  const currentConfig = getEnvironmentConfig();
  const [selectedType, setSelectedType] = useState<EnvType>(currentConfig.type);
  const [localUrlInput, setLocalUrlInput] = useState<string>(currentConfig.localUrl);
  const [inputError, setInputError] = useState<string | null>(null);

  // Ping 测试状态
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{
    ok: boolean;
    latencyMs: number;
    statusText: string;
  } | null>(null);

  const handleTestPing = async () => {
    setPingLoading(true);
    setPingResult(null);
    try {
      const result = await adminApi.pingHealth();
      setPingResult(result);
    } catch {
      setPingResult({
        ok: false,
        latencyMs: 0,
        statusText: '网络故障或目标服务端口未开启',
      });
    } finally {
      setPingLoading(false);
    }
  };

  const handleApply = () => {
    setInputError(null);

    // 校验本地地址
    if (selectedType === 'local') {
      const sanitized = sanitizeOriginUrl(localUrlInput);
      if (!sanitized.valid) {
        setInputError(sanitized.error || '本地服务地址无效');
        return;
      }
    }

    try {
      setEnvironmentConfig(selectedType, localUrlInput);
      onClose();
      if (onEnvironmentSwitched) {
        onEnvironmentSwitched();
      }
    } catch (err: unknown) {
      setInputError(err instanceof Error ? err.message : '保存配置失败');
    }
  };

  const handleResetDefaultLocal = () => {
    setLocalUrlInput(DEFAULT_LOCAL_URL);
    setInputError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#FFF0EB] text-[#F2785C] flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">接口环境配置</h3>
              <p className="text-[11px] text-slate-500">
                仅在 Vite 开发模式生效 · 生产构建固定使用线上地址
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容主体 */}
        <div className="p-5 space-y-4 text-xs">
          {/* 环境选择单选框 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700 block">选择服务目标</label>

            {/* 本地环境选项 */}
            <div
              onClick={() => setSelectedType('local')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedType === 'local'
                  ? 'border-[#F2785C] bg-[#FFF0EB]/40 ring-1 ring-[#F2785C]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Server className={`w-4 h-4 ${selectedType === 'local' ? 'text-[#F2785C]' : 'text-slate-500'}`} />
                  <span className="font-semibold text-slate-900">本地开发环境 (Local)</span>
                </div>
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedType === 'local'
                      ? 'border-[#F2785C] bg-[#F2785C]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedType === 'local' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 pl-6">
                连接本地或局域网中运行的 Spring Boot Server (默认 8080)
              </p>
            </div>

            {/* 线上环境选项 */}
            <div
              onClick={() => setSelectedType('online')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedType === 'online'
                  ? 'border-[#F2785C] bg-[#FFF0EB]/40 ring-1 ring-[#F2785C]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Globe className={`w-4 h-4 ${selectedType === 'online' ? 'text-[#F2785C]' : 'text-slate-500'}`} />
                  <span className="font-semibold text-slate-900">线上生产环境 (Production/Remote)</span>
                </div>
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedType === 'online'
                      ? 'border-[#F2785C] bg-[#F2785C]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedType === 'online' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 pl-6 font-mono text-slate-600">
                {DEFAULT_ONLINE_URL}
              </p>
            </div>
          </div>

          {/* 本地地址自定义编辑 */}
          {selectedType === 'local' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  本地服务源地址 (协议://主机:端口)
                </label>
                <button
                  type="button"
                  onClick={handleResetDefaultLocal}
                  className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                >
                  恢复默认 (8080)
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={localUrlInput}
                  onChange={(e) => setLocalUrlInput(e.target.value)}
                  placeholder="http://127.0.0.1:8080"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F2785C]/20 focus:border-[#F2785C]"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                若在其他设备或手机调试，可输入开发机的局域网 IP (如 <span className="font-mono text-slate-700">http://192.168.1.100:8080</span>)。请求层会自动追加 <span className="font-mono text-slate-700">/api</span>。
              </p>
              {inputError && (
                <p className="text-[11px] text-rose-600 font-medium">{inputError}</p>
              )}
            </div>
          )}

          {/* 连通性测试结果面板 */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                <Radio className="w-3.5 h-3.5 text-slate-500" />
                <span>连通性诊断</span>
              </div>
              <button
                type="button"
                onClick={handleTestPing}
                disabled={pingLoading}
                className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pingLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[#F2785C]" />
                    探测中...
                  </>
                ) : (
                  '测试连通性'
                )}
              </button>
            </div>

            {pingResult && (
              <div
                className={`flex items-start gap-2 p-2 rounded text-[11px] ${
                  pingResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {pingResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {pingResult.ok ? '服务可连通' : '服务连接未成功'}
                    {pingResult.ok && (
                      <span className="font-mono font-normal ml-1.5 text-[10px] text-emerald-700">
                        ({pingResult.latencyMs}ms)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] opacity-90 mt-0.5">{pingResult.statusText}</p>
                </div>
              </div>
            )}
          </div>

          {/* 切换影响提醒 */}
          <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              切换服务环境会立即中止前一环境的所有进行中请求，并清空当前登录会话，需在目标服务重新登录。
            </p>
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 text-xs text-white font-medium bg-[#F2785C] hover:bg-[#E06448] rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            应用并重载
          </button>
        </div>
      </div>
    </div>
  );
};
