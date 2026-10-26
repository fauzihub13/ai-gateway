'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CodeBlock({
  code,
  filename,
  className,
  maxHeight = 420,
}: {
  code: string;
  filename?: string;
  className?: string;
  /**
   * Tinggi maksimum area kode dalam px. Kode yang lebih panjang akan
   * di-scroll di dalam blok, bukan memanjangkan halaman. `null` untuk
   * membiarkan tinggi mengikuti isi.
   */
  maxHeight?: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const update = () => {
      setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [code, maxHeight]);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn('overflow-hidden rounded-sm border border-hairline bg-card', className)}>
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{filename ?? 'shell'}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Tersalin' : 'Copy'}
        </button>
      </div>
      <div className="relative">
        <pre
          ref={preRef}
          tabIndex={0}
          style={maxHeight ? { maxHeight } : undefined}
          className={cn(
            'scrollbar-thin overflow-auto p-4 text-xs leading-relaxed',
            maxHeight ? 'overscroll-contain' : undefined,
          )}
        >
          <code>{code}</code>
        </pre>
        {hasMore && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
          />
        )}
      </div>
    </div>
  );
}
