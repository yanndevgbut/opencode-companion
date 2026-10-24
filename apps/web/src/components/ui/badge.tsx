import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-sky-500/10 text-sky-400 border border-sky-500/20",
        secondary: "border-transparent bg-slate-800 text-slate-300",
        destructive: "border-transparent bg-red-500/10 text-red-400 border border-red-500/20",
        outline: "text-slate-300 border-slate-700",
        success: "border-transparent bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        warning: "border-transparent bg-amber-500/10 text-amber-400 border border-amber-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
