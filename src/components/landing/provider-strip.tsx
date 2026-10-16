'use client';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'meta', name: 'Meta' },
];

/**
 * Provider ecosystem strip. Uses monochrome wordmarks (no third-party logo
 * assets). Hover highlights the matching node in the routing blueprint via a
 * custom window event.
 */
export function ProviderStrip() {
  function emit(id: string | null) {
    window.dispatchEvent(new CustomEvent('mpruy:provider-hover', { detail: { id } }));
  }

  return (
    <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onMouseEnter={() => emit(p.id)}
          onMouseLeave={() => emit(null)}
          onFocus={() => emit(p.id)}
          onBlur={() => emit(null)}
          className="font-display text-lg tracking-tight text-muted-foreground transition-colors hover:text-electric focus-visible:text-electric"
        >
          {p.name}
        </button>
      ))}
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        + provider OpenAI-compatible lain
      </span>
    </div>
  );
}