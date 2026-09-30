import { Crosshair } from "lucide-react";
import { APP_NAME, APP_SUBTITLE, APP_TAGLINE } from "@/lib/config";

export function Header({ compact, right }: { compact?: boolean; right?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white">
          <Crosshair className="h-4 w-4" aria-hidden />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-ink">
            {APP_NAME}
            {!compact && <span className="ml-2 font-normal text-muted">{APP_TAGLINE}</span>}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{APP_SUBTITLE}</div>
        </div>
      </div>
      {right}
    </header>
  );
}
