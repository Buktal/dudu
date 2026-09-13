/** Tauri 和 Redux thunk 也可能返回字符串或序列化后的 Error。 */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "操作未完成，请重试。";
}
