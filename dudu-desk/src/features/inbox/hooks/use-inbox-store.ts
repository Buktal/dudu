import { useDispatch, useSelector } from "react-redux";
import type { InboxDispatch, InboxRootState } from "../stores/store";

export const useInboxDispatch = useDispatch.withTypes<InboxDispatch>();
export const useInboxSelector = useSelector.withTypes<InboxRootState>();
