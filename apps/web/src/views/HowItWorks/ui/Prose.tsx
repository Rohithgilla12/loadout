import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="text-[14.5px] text-ink-soft leading-relaxed space-y-4 max-w-xl mb-6 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:bg-paper-sunken [&_code]:border [&_code]:border-line [&_code]:rounded [&_code]:px-1 [&_strong]:text-ink [&_strong]:font-semibold">
      {children}
    </div>
  );
}
