export {
  expectEntry,
  expectRow,
  type InterpretClock,
  type InterpretedStep,
  type InterpretMissingKind,
  interpretEventStep,
  interpretPresence,
  interpretTemplateStep,
  type PresenceVerdict,
} from "./interpret";
export { latestVersionOf, resolveRow } from "./resolve";

/**
 * 引用解析子系统的域内出口（评审 C1）：interpreter（interpret*，唯一深
 * module）与 kernel 下钻原语（resolveRow / latestVersionOf）经此处供
 * events 门面再导出。consequence 表（./consequences）是域内私有，
 * 不经本出口——缺失语义只能经 interpret* 消费。
 */
