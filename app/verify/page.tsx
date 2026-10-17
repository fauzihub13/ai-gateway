import Link from 'next/link';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { VerifyEmailClient } from './verify-client';

export const metadata = { title: 'Verifikasi email · Mpruy AI' };

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm">
          <CardContent className="py-10">
            <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center border border-foreground bg-foreground font-display text-xs font-semibold text-background">
                M
              </span>
              <span className="font-display text-[13px] font-semibold tracking-tight">
                Mpruy<span className="text-electric">AI</span>
              </span>
            </Link>
            <Suspense
              fallback={
                <div className="flex flex-col items-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Memuat…</p>
                </div>
              }
            >
              <VerifyEmailClient />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}