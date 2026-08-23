import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

export function ComingSoon({ icon: Icon, title, phase, description }: { icon: LucideIcon; title: string; phase: string; description: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-tertiary">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-primary">{title}</h2>
      <p className="max-w-md text-sm text-secondary">{description}</p>
      <span className="mt-1 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-tertiary font-mono">
        {phase}
      </span>
    </Card>
  );
}
