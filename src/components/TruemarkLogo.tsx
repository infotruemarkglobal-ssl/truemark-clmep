import { cn } from "@/lib/utils";

export function TruemarkLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="w-2/3 h-2/3 text-white"
        aria-hidden="true"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    </div>
  );
}

export function TruemarkLogoColour({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-gradient-to-br from-primary to-[oklch(0.41_0.13_162.5)] rounded-lg flex items-center justify-center shadow-lg",
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="w-2/3 h-2/3 text-white"
        aria-hidden="true"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    </div>
  );
}
