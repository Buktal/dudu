import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { failureOf } from "@/lib/api-response";
import { type Preference, type Translation, translationApi } from "./api";

type Context = {
  preference: Preference;
  pending: boolean;
  error: string | null;
  save: (preference: Preference) => Promise<void>;
  translate: (
    id: string,
    version: number,
    language: string,
  ) => Promise<Translation>;
  /** 重新读取偏好：设置面板在加载失败时用同一入口重试。 */
  reload: () => void;
};
const TranslationContext = createContext<Context | null>(null);
export const useTranslation = () => useContext(TranslationContext);

export function TranslationProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>({
    automatic: false,
    targetLanguage: "zh",
  });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(new Set<AbortController>());
  const requests = useRef(new Map<string, Promise<Translation>>());
  const lanes = useRef<Promise<void>[]>([
    Promise.resolve(),
    Promise.resolve(),
    Promise.resolve(),
  ]);
  const saving = useRef(false);
  // 偏好加载的重试计数：reload 递增后重新读取，卸载清理单独走一次
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 只作重试信号：effect 不读取它，递增本身就要重新加载偏好
  useEffect(() => {
    const controller = new AbortController();
    active.current.add(controller);
    setPending(true);
    void translationApi
      .preference(controller.signal)
      .then(
        (value) => {
          if (!controller.signal.aborted) {
            setPreference(value);
            setError(null);
          }
        },
        () => {
          if (!controller.signal.aborted) setError("翻译偏好加载失败，请重试");
        },
      )
      .finally(() => {
        active.current.delete(controller);
        if (!controller.signal.aborted) setPending(false);
      });
    // 只取消本次加载：在途的翻译请求与缓存不受重试影响
    return () => {
      controller.abort();
    };
  }, [attempt]);
  useEffect(
    () => () => {
      // 卸载时取消全部在途请求并清空缓存：权限切换或重开会话后重新授权读取
      for (const item of active.current) item.abort();
      active.current.clear();
      requests.current.clear();
    },
    [],
  );
  const save = async (next: Preference) => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    active.current.add(controller);
    try {
      const result = await translationApi.save(next, controller.signal);
      if (!controller.signal.aborted) {
        setPreference(result);
        requests.current.clear();
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failureOf(failure, "偏好保存失败").message);
    } finally {
      active.current.delete(controller);
      saving.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const translate = (id: string, version: number, language: string) => {
    const key = `${id}:${version}:${language}`;
    const existing = requests.current.get(key);
    if (existing) return existing;
    const controller = new AbortController();
    active.current.add(controller);
    const available = lanes.current.shift() ?? Promise.resolve();
    const promise = available
      .then(() =>
        translationApi.translate(id, version, language, controller.signal),
      )
      .finally(() => {
        active.current.delete(controller);
        // 仅合并在途请求，译文仅由当前挂载的消息持有，权限切换或重开会话后重新授权读取。
        if (requests.current.get(key) === promise) requests.current.delete(key);
      });
    requests.current.set(key, promise);
    lanes.current.push(
      promise.then(
        () => undefined,
        () => undefined,
      ),
    );
    return promise;
  };
  const reload = () => {
    setError(null);
    setAttempt((value) => value + 1);
  };
  return (
    <TranslationContext
      value={{ preference, pending, error, save, translate, reload }}
    >
      {children}
    </TranslationContext>
  );
}
