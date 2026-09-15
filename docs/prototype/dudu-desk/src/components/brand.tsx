import { motion } from "motion/react";
import logo from "../assets/dudu-logo.svg?inline";
import mark from "../assets/dudu-mark.svg?inline";
import { softSpring } from "./motion";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <motion.div
      className={`brand ${compact ? "brand-compact" : ""}`}
      role="img"
      aria-label="嘟嘟 DuduDesk"
      whileHover={{ rotate: -3, scale: 1.04 }}
      transition={softSpring}
    >
      <img className="brand-symbol" src={mark} alt="" width="42" height="42" />
      {!compact && (
        <img
          className="brand-wordmark"
          src={logo}
          alt=""
          width="168"
          height="48"
        />
      )}
    </motion.div>
  );
}
