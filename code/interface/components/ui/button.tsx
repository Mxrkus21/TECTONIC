import { cn } from "@/lib/client/cn";

type Variant = "primary" | "secondary" | "ghost" | "chip" | "chipActive";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-card text-ink border border-border hover:bg-primary-soft",
  ghost: "text-muted hover:text-ink hover:bg-primary-soft",
  chip: "bg-card text-primary border border-primary/30 hover:bg-primary-soft rounded-full",
  chipActive: "bg-primary text-white border border-primary rounded-full",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "h-9 w-9",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
