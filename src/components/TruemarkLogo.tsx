import Image from "next/image";
import { cn } from "@/lib/utils";

export function TruemarkLogo({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Image
        src="/truemark-logo.png"
        alt="TrueMark Global Standards & Solutions Limited"
        fill
        className="object-contain brightness-0 invert"
        priority
      />
    </div>
  );
}

export function TruemarkLogoColour({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Image
        src="/truemark-logo.png"
        alt="TrueMark Global Standards & Solutions Limited"
        fill
        className="object-contain"
        priority
      />
    </div>
  );
}
