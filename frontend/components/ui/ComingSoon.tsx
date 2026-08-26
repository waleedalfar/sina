import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, phase, description }: { icon: LucideIcon; title: string; phase: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-t-[3px] border-hairline border-t-warning bg-surface px-5 py-10 text-center text-warning">
      <div className="flex h-12 w-12 items-center justify-center border border-dashed border-current">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
      <p className="max-w-[42ch] text-[12.5px] leading-relaxed text-secondary">{description}</p>
      <span className="mt-1 border border-strong px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-secondary">
        {phase}
      </span>
    </div>
  );
}
