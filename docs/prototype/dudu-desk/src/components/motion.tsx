import { useReducedMotion } from "motion/react";
import { type ReactNode, useRef } from "react";
import { BlurFade } from "./magicui/blur-fade";
import { NumberTicker } from "./magicui/number-ticker";

export const softSpring = {
  type: "spring",
  stiffness: 460,
  damping: 38,
  mass: 0.8,
} as const;

export function SoftReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <BlurFade
      className={className}
      duration={reduced ? 0 : 0.18}
      delay={-0.04}
      offset={reduced ? 0 : 4}
      blur={reduced ? "0px" : "2px"}
    >
      {children}
    </BlurFade>
  );
}

export function Count({ value }: { value: number }) {
  const initial = useRef(value);
  const reduced = useReducedMotion();
  return (
    <span className="count-value">
      {reduced ? (
        value
      ) : (
        <>
          <NumberTicker
            value={value}
            startValue={initial.current}
            aria-hidden="true"
          />
          <span className="sr-only">{value}</span>
        </>
      )}
    </span>
  );
}
