"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/client/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn("flex gap-1 border-b border-border px-4", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted hover:text-ink data-[state=active]:border-primary data-[state=active]:text-primary",
        className,
      )}
      {...props}
    />
  );
}
