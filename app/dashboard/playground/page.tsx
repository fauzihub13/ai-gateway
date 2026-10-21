'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, User as UserIcon } from 'lucide-react';
import { PageHeader } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/client';

interface ModelInfo {
  publicName: string;
  displayName: string;
  priceInPer1MIdr: number;
  priceOutPer1MIdr: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PlaygroundPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [usage, setUsage] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/models')
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((d) => {
        setModels(d.models ?? []);
        if (d.models?.[0]) setModel(d.models[0].publicName);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    if (!model || !input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setUsage('');
    setLoading(true);
    try {
      const res = await apiFetch('/api/playground/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages([...next, { role: 'assistant', content: `⚠ ${data?.error?.message ?? 'Gagal.'}` }]);
        return;
      }
      setMessages([...next, { role: 'assistant', content: data.choices?.[0]?.message?.content ?? '' }]);
      if (data.usage) setUsage(`${data.usage.total_tokens} token`);
    } finally {
      setLoading(false);
    }
  }

  const selected = models.find((m) => m.publicName === model);

  return (
    <div>
      <PageHeader title="Playground" description="Coba model langsung. Percakapan memakai saldo Anda." />

      <Card className="flex h-[calc(100vh-14rem)] flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
          <div className="flex items-center gap-3">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Pilih model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.publicName} value={m.publicName}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <CardDescription className="hidden sm:block">
                Rp{selected.priceInPer1MIdr}/Rp{selected.priceOutPer1MIdr} per 1M token
              </CardDescription>
            )}
          </div>
          {usage && <span className="text-xs text-muted-foreground">{usage}</span>}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 opacity-50" />
              <p className="text-sm">Kirim pesan untuk mulai mencoba.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                      m.role === 'user' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/15 text-primary',
                    )}
                  >
                    {m.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  </div>
                  <div
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg bg-muted px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </CardContent>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Tulis pesan... (Enter kirim, Shift+Enter baris baru)"
              rows={1}
              className="min-h-[44px] resize-none"
            />
            <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}