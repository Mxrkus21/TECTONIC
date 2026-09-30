import { cn } from "@/lib/client/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("pp-skeleton h-4 w-full", className)} />;
}
