import { Button as BaseButton } from "@desk/components/ui/button";
import { type LucideIcon, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { RippleButton } from "./magicui/ripple-button";

export { Brand } from "./brand";

export function Button({
  variant = "default",
  render,
  ...props
}: ComponentProps<typeof BaseButton>) {
  const reduced = useReducedMotion();
  return (
    <BaseButton
      variant={variant}
      render={
        render ??
        (variant === "default" ? (
          <RippleButton
            rippleColor="var(--primary-foreground)"
            duration={reduced ? "0ms" : "480ms"}
            className="[&>div.relative]:inline-flex [&>div.relative]:items-center [&>div.relative]:justify-center [&>div.relative]:gap-[inherit]"
          />
        ) : undefined)
      }
      {...props}
    />
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      data-active={active}
      className="data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon data-icon="inline-start" />
    </Button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <motion.dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-label={title}
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={{ duration: 0.18 }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <IconButton icon={X} label="关闭" onClick={onClose} />
      </div>
      {children}
    </motion.dialog>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">✓</span>
      {children}
    </div>
  );
}
