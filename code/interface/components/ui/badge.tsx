import { cn } from "@/lib/client/cn";

type Tone = "neutral" | "conflict" | "warning" | "trusted" | "primary";
const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-border",
  conflict: "bg-conflict-soft text-conflict border-conflict/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  trusted: "bg-trusted-soft text-trusted border-trusted/25",
  primary: "bg-primary-soft text-primary border-primary/20",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}
