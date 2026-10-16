import type { Metadata } from 'next';
import { Inter, EB_Garamond, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Editorial reading serif (spec: EB Garamond).
const reading = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-reading',
  display: 'swap',
});

// Technical monospace. Used for display headings and annotations.
// Spec prefers "Departure Mono"; we request it first via the `display` font stack
// in tailwind.config.ts and fall back to this loaded mono when unavailable.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mpruy AI — One API. Every AI Model.',
  description:
    'Gateway API terpadu untuk banyak provider AI. OpenAI-compatible, streaming SSE, pricing transparan per token.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${sans.variable} ${reading.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}