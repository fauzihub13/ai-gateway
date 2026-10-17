'use client';

import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlaygroundModel {
  publicName: string;
  displayName: string;
}

type StepState = 'idle' | 'active' | 'done';

const SAMPLE = [
  { role: 'system', content: 'You are a concise assistant.' },
  { role: 'user', content: 'Ringkas arsitektur gateway ini dalam satu kalimat.' },
];

const SAMPLE_REPLY =
  'Gateway menerima request OpenAI-compatible, memilih provider berdasarkan model, meneruskan via streaming SSE, lalu mencatat usage untuk billing.';

export function RequestPlayground({
  models,
  baseUrl = 'https://ai.mpruy.my.id/v1',
}: {
  models: PlaygroundModel[];
  baseUrl?: string;
}) {
  const [model, setModel] = useState(models[0]?.publicName ?? 'mimo');
  const [tab, setTab] = useState<'curl' | 'ts'>('curl');
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(['idle', 'idle', 'idle']);
  const [output, setOutput] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const snippets = useMemo(() => {
    const body = { model, messages: SAMPLE, stream: true };
    const curl = `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-mpruy-..." \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body)}'`;
    const ts = `const res = await fetch('${baseUrl}/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer sk-mpruy-...',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${JSON.stringify(body, null, 2)}),
});

// SSE: baca ReadableStream, akumulasi delta.content
const reader = res.body!.getReader();`;
    return { curl, ts };
  }, [model, baseUrl]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function copy() {
    navigator.clipboard.writeText(snippets[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function run() {
    clearTimers();
    setRunning(true);
    setOutput('');
    setLatency(null);
    setSteps(['active', 'idle', 'idle']);

    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(
      setTimeout(() => setSteps(['done', 'active', 'idle']), 620),
      setTimeout(() => {
        setSteps(['done', 'done', 'active']);
        setLatency(280 + Math.floor(Math.random() * 340));
      }, 1240),
      setTimeout(() => {
        setSteps(['done', 'done', 'done']);
        // simulated token stream
        let i = 0;
        const words = SAMPLE_REPLY.split(' ');
        const tick = () => {
          i += 1;
          setOutput(words.slice(0, i).join(' '));
          if (i < words.length) t.push(setTimeout(tick, 38));
          else setRunning(false);
        };
        tick();
      }, 1720),
    );
    timers.current = t;
  }

  function reset() {
    clearTimers();
    setRunning(false);
    setSteps(['idle', 'idle', 'idle']);
    setOutput('');
    setLatency(null);
  }

  const stepLabels = ['Resolve model', 'Route to provider', 'Stream response'];

  return (
    <div className="grid gap-px overflow-hidden rounded-sm border border-hairline bg-hairline lg:grid-cols-2">
      {/* Code panel */}
      <div className="min-w-0 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5">
          <div className="flex items-center gap-3">
            {(['curl', 'ts'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
                  tab === k ? 'text-electric' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'curl' ? 'cURL' : 'TypeScript'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <label className="sr-only" htmlFor="pg-model">
              Model
            </label>
            <select
              id="pg-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 max-w-[10rem] rounded-sm border border-hairline bg-background px-2 font-mono text-[11px] text-foreground outline-none focus-visible:border-electric"
            >
              {models.length === 0 && <option value="mimo">mimo</option>}
              {models.map((m) => (
                <option key={m.publicName} value={m.publicName}>
                  {m.publicName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
        </div>
        <pre className="scrollbar-thin overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85">
          <code>{snippets[tab]}</code>
        </pre>
      </div>

      {/* Run panel */}
      <div className="flex min-w-0 flex-col bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5">
          <span className="tech-label">Response</span>
          <span className="flex items-center gap-2">
            <span className="rounded-sm border border-warning/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-warning">
              simulated
            </span>
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-electric px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white transition-colors hover:bg-electric/90 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </button>
            <button
              type="button"
              onClick={reset}
              className="grid h-7 w-7 place-items-center rounded-sm border border-hairline text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>

        <ol className="border-b border-hairline">
          {stepLabels.map((label, i) => (
            <li
              key={label}
              className="flex items-center justify-between border-b border-hairline px-4 py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded-full border font-mono text-[9px]',
                    steps[i] === 'done'
                      ? 'border-electric bg-electric text-white'
                      : steps[i] === 'active'
                        ? 'border-electric text-electric animate-node-pulse'
                        : 'border-hairline text-muted-foreground',
                  )}
                >
                  {steps[i] === 'done' ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'font-mono text-[11px] uppercase tracking-[0.12em]',
                    steps[i] === 'idle' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {label}
                </span>
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {steps[i] === 'done' ? 'ok' : steps[i] === 'active' ? '···' : '—'}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>data: delta.content</span>
            <span className="tabular">{latency ? `${latency}ms` : '—'}</span>
          </div>
          <div className="min-h-[112px] flex-1 rounded-sm border border-hairline bg-background p-3">
            {output ? (
              <p className="font-reading text-[15px] leading-relaxed text-foreground">
                {output}
                {running && <span className="ml-0.5 inline-block h-4 w-[2px] animate-node-pulse bg-electric align-middle" />}
              </p>
            ) : (
              <p className="font-mono text-[11px] text-muted-foreground">
                Tekan <span className="text-electric">Run</span> untuk melihat simulasi alur request. Data contoh, bukan
                panggilan API asli.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}