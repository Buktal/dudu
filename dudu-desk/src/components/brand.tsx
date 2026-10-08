import { motion, useReducedMotion } from "motion/react";
import { palettes } from "@/lib/theme-palette";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

const baseUrl = import.meta.env.BASE_URL;
const logo = `${baseUrl}dudu-logo.svg`;
const darkLogo = `${baseUrl}dudu-logo-dark.svg`;
const mark = `${baseUrl}logo.svg`;

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      role="img"
      aria-label="嘟嘟 DuduDesk"
      className={cn("flex shrink-0 items-center", className)}
      whileHover={reduceMotion ? undefined : { rotate: -3, scale: 1.04 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
    >
      <img
        src={mark}
        alt=""
        width="36"
        height="36"
        className={cn("size-9", !compact && "min-[761px]:hidden")}
      />
      {!compact && (
        <img
          src={palettes[theme].scheme === "dark" ? darkLogo : logo}
          alt=""
          width="134"
          height="40"
          className="block h-10 w-[134px] object-contain max-[760px]:hidden"
        />
      )}
    </motion.div>
  );
}
