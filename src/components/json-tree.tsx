'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type JsonContainer = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is JsonContainer {
  return typeof value === 'object' && value !== null;
}

function entriesOf(value: JsonContainer): Array<[string, unknown]> {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as [string, unknown])
    : Object.entries(value);
}

function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function collectContainerPaths(value: unknown, path = '$', out: string[] = []): string[] {
  if (!isContainer(value)) return out;
  out.push(path);
  for (const [key, child] of entriesOf(value)) {
    collectContainerPaths(child, `${path}/${escapePointer(key)}`, out);
  }
  return out;
}

/** Lebar indentasi per level (px). */
const INDENT = 14;
/** Ruang chevron + gap, agar primitive sejajar dengan key milik object. */
const CHEVRON_SPACE = 18;

function Primitive({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    return <span className="text-success">&quot;{value}&quot;</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-warning">{String(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-electric">{String(value)}</span>;
  }
  if (value === null) {
    return <span className="italic text-muted-foreground">null</span>;
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

export interface JsonTreeProps {
  /** Nilai JSON yang sudah di-parse (object/array/primitive). */
  data: unknown;
  /**
   * Level yang otomatis terbuka. Container pada `depth < defaultExpandDepth`
   * ditampilkan terbuka; sisanya collapsed. Default 4.
   */
  defaultExpandDepth?: number;
  /** Tinggi maksimum area tree dalam px. `null` untuk tanpa batas. */
  maxHeight?: number | null;
  className?: string;
}

/**
 * Penampil JSON dengan collapse/expand per object & array, mirip folding
 * di VS Code. Setiap container punya chevron; ringkasan `{…} N key`
 * ditampilkan saat collapsed.
 */
export function JsonTree({
  data,
  defaultExpandDepth = 4,
  maxHeight = 420,
  className,
}: JsonTreeProps) {
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const containerPaths = React.useMemo(() => collectContainerPaths(data), [data]);

  const isExpanded = React.useCallback(
    (path: string, depth: number) => overrides[path] ?? depth < defaultExpandDepth,
    [overrides, defaultExpandDepth],
  );

  const toggle = React.useCallback((path: string, depth: number) => {
    setOverrides((prev) => ({ ...prev, [path]: !(prev[path] ?? depth < defaultExpandDepth) }));
  }, [defaultExpandDepth]);

  const setAll = React.useCallback(
    (expanded: boolean) => {
      const next: Record<string, boolean> = {};
      for (const path of containerPaths) {
        // Saat "Tutup semua", root tetap terbuka agar key level pertama
        // ($schema, model, providers, …) masih terlihat.
        next[path] = path === '$' ? true : expanded;
      }
      setOverrides(next);
    },
    [containerPaths],
  );

  const renderNode = (
    key: string | null,
    value: unknown,
    depth: number,
    path: string,
    isLast: boolean,
  ): React.ReactNode => {
    const comma = isLast ? null : <span className="text-muted-foreground">,</span>;
    const keyLabel =
      key === null ? null : (
        <>
          <span className="text-electric">{key}</span>
          <span className="text-muted-foreground">: </span>
        </>
      );

    if (!isContainer(value)) {
      return (
        <div
          key={path}
          className="whitespace-pre"
          style={{ paddingLeft: depth * INDENT + CHEVRON_SPACE }}
        >
          {keyLabel}
          <Primitive value={value} />
          {comma}
        </div>
      );
    }

    const expanded = isExpanded(path, depth);
    const entries = entriesOf(value);
    const isArray = Array.isArray(value);
    const open = isArray ? '[' : '{';
    const close = isArray ? ']' : '}';
    const summary = `${entries.length} ${isArray ? 'item' : 'key'}`;

    return (
      <div key={path}>
        <div className="flex items-start whitespace-pre" style={{ paddingLeft: depth * INDENT }}>
          <button
            type="button"
            onClick={() => toggle(path, depth)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Tutup object' : 'Buka object'}
            className="-ml-0.5 mr-0.5 mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {keyLabel}
          <span className="text-muted-foreground">{open}</span>
          {!expanded && (
            <>
              <button
                type="button"
                onClick={() => toggle(path, depth)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                title={`Buka ${summary}`}
              >
                …{close}
              </button>
              <span className="ml-1.5 select-none text-[10px] italic text-muted-foreground">
                {summary}
              </span>
              {comma}
            </>
          )}
        </div>
        {expanded && (
          <>
            {entries.map(([childKey, childValue], index) =>
              renderNode(
                childKey,
                childValue,
                depth + 1,
                `${path}/${escapePointer(childKey)}`,
                index === entries.length - 1,
              ),
            )}
            <div
              className="whitespace-pre text-muted-foreground"
              style={{ paddingLeft: depth * INDENT + CHEVRON_SPACE }}
            >
              {close}
              {comma}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={cn('overflow-hidden rounded-sm border border-hairline bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            Buka semua
          </button>
          <span aria-hidden="true" className="h-3 w-px bg-hairline" />
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
          >
            Tutup semua
          </button>
        </div>
        <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
          klik chevron untuk buka/tutup
        </span>
      </div>
      <div
        tabIndex={0}
        style={maxHeight ? { maxHeight } : undefined}
        className={cn(
          'scrollbar-thin overflow-auto p-3 font-mono text-xs leading-relaxed',
          maxHeight ? 'overscroll-contain' : undefined,
        )}
      >
        {renderNode(null, data, 0, '$', true)}
      </div>
    </div>
  );
}
