import { cn } from "cn";
import { LoaderCircle, type LucideProps } from "lucide-react";

/**
 * 进行中旋转图标：动画与 motion-reduce 退化在单点收口
 */
function Spinner({ className, ...props }: LucideProps) {
  return (
    <LoaderCircle
      className={cn("animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };
