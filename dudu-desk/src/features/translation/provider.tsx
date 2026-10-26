import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  useEffect(() => {
    const controller = new AbortController();
    const controllers = active.current;
    const cache = requests.current;
    controllers.add(controller);
    void translationApi
      .preference(controller.signal)
      .then(
        (value) => {
          if (!controller.signal.aborted) setPreference(value);
        },
        () => {
          if (!controller.signal.aborted)
            setError("翻译偏好加载失败，可重新打开工作台重试");
        },
      )
      .finally(() => {
        controllers.delete(controller);
        if (!controller.signal.aborted) setPending(false);
      });
    return () => {
      for (const item of controllers) item.abort();
      controllers.clear();
      cache.clear();
    };
  }, []);
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
        setError(failure instanceof Error ? failure.message : "偏好保存失败");
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
  return (
    <TranslationContext value={{ preference, pending, error, save, translate }}>
      {children}
    </TranslationContext>
  );
}
