import { cn } from '@/lib/utils';

/**
 * Consistent frame for every blueprint illustration: technical label header,
 * drawing area, and an editorial caption. Keeps the showcase visually uniform
 * while each illustration keeps its own metaphor.
 */
export function Plate({
  label,
  index,
  title,
  caption,
  children,
  className,
}: {
  label: string;
  index: string;
  title: string;
  caption: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'flex flex-col overflow-hidden rounded-sm border border-hairline bg-card',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="tech-label">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground/70">{index}</span>
      </div>
      <div className="relative flex-1 p-4">{children}</div>
      <figcaption className="border-t border-hairline px-4 py-3">
        <p className="font-display text-[13px] font-semibold tracking-tight">{title}</p>
        <p className="reading mt-1 text-[14px]">{caption}</p>
      </figcaption>
    </figure>
  );
}