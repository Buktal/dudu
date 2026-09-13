import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/store";

// 只依赖 store 的类型；运行时从 Provider 取值，导入 hook 不会创建全局 store。
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
