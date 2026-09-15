import dayjs from "dayjs";

export const nowTime = () => dayjs().format("HH:mm");
export const waitLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
