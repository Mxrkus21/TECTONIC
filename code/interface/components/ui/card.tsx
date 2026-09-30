import { cn } from "@/lib/client/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(15,27,45,0.04)]", className)} {...props} />;
}
