import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Info, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Disclaimer — Mpruy AI',
  description:
    'Disclaimer spesifikasi model di Mpruy AI: context in/out dan kemampuan model disajikan apa adanya (as is) sesuai provider, dan dapat berubah sewaktu-waktu.',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-hairline pt-10 first:border-t-0 first:pt-0">
      <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Callout({
  children,
  variant = 'info',
}: {
  children: React.ReactNode;
  variant?: 'info' | 'warn';
}) {
  const Icon = variant === 'warn' ? TriangleAlert : Info;
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Logo className="h-5" />
            <span className="font-display text-[13px] font-semibold tracking-tight">
              Mpruy<span className="text-electric">AI</span>
            </span>
            <span className="ml-1 hidden rounded-sm border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              Disclaimer
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Beranda</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="container max-w-3xl py-12">
        <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          Ketentuan &amp; Batasan
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Disclaimer Model</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        <div className="mt-10 space-y-10">
          <Section id="ringkasan" title="Ringkasan">
            <p>
              Seluruh model yang tersedia di Mpruy AI — baik yang berbayar (<em>paid</em>) maupun yang
              gratis (<em>free</em>) — disajikan beserta spesifikasinya secara <strong>apa adanya (as is)</strong>.
              Spesifikasi tersebut mencakup antara lain <strong>context window (input)</strong>, batas{' '}
              <strong>output</strong>, serta <strong>kemampuan (capabilities)</strong> seperti streaming, vision,
              function/tool calling, JSON mode, dan embeddings.
            </p>
            <p>
              Nilai spesifikasi yang ditampilkan diambil dan diselaraskan dari <strong>masing-masing provider</strong>{' '}
              model terkait. Mpruy AI hanya meneruskan permintaan Anda ke provider tersebut melalui satu endpoint
              yang kompatibel dengan OpenAI; kami tidak memodifikasi, menjamin, atau menjadikan ulang spesifikasi
              teknis dari provider.
            </p>
            <Callout>
              Artinya: spesifikasi yang Anda lihat di Mpruy AI mencerminkan apa yang dideklarasikan provider
              pada saat data tersebut ditarik. Jika provider mengubah spesifikasi, perilaku, atau ketersediaan
              modelnya, tampilan di Mpruy AI dapat menyesuaikan diri tanpa pemberitahuan terpisah.
            </Callout>
          </Section>

          <Section id="as-is" title="Spesifikasi Disajikan “As Is”">
            <p>Spesifikasi tiap model, termasuk namun tidak terbatas pada:</p>
            <ul className="ml-5 list-disc space-y-1.5">
              <li>
                <strong>Context input</strong> — jumlah maksimum token yang dapat dikirim dalam satu permintaan.
              </li>
              <li>
                <strong>Batas output</strong> — jumlah maksimum token yang dapat dihasilkan model.
              </li>
              <li>
                <strong>Kemampuan</strong> — dukungan streaming, vision (input gambar), tool/function calling,
                JSON mode, dan embeddings.
              </li>
              <li>
                <strong>Perilaku runtime</strong> — misalnya penanganan cache, format respons, dan cara token
                dihitung oleh provider.
              </li>
            </ul>
            <p>
              Semuanya disajikan tanpa jaminan akurasi, kelengkapan, atau kesesuaian untuk tujuan tertentu.
              Spesifikasi ini bersifat informatif dan dapat berbeda dari perilaku aktual provider pada saat
              permintaan Anda diproses.
            </p>
            <p>
              Daftar model beserta spesifikasi terkini dapat dilihat pada halaman{' '}
              <Link href="/docs#models" className="font-medium text-foreground underline underline-offset-4">
                Dokumentasi — Models
              </Link>{' '}
              dan pada endpoint <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /v1/models</code>.
            </p>
          </Section>

          <Section id="perubahan" title="Dapat Berubah Sewaktu-waktu">
            <div className="flex gap-3 rounded-lg border bg-muted/40 p-4">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="text-sm text-muted-foreground">
                Spesifikasi dan ketersediaan model <strong>dapat berubah sewaktu-waktu</strong> bergantung pada
                kebijakan dan kondisi masing-masing provider.
              </div>
            </div>
            <p>
              Perubahan dapat terjadi kapan saja tanpa pemberitahuan lebih dulu, termasuk tetapi tidak terbatas
              pada: perubahan context window, batas output, dukungan kemampuan, penambahan atau penghapusan model,
              perubahan perilaku penalaran, hingga penghentian (<em>deprecation</em>) atau nonaktifnya suatu model
              oleh provider.
            </p>
            <p>
              Mpruy AI berupaya menyelaraskan data spesifikasi secara berkala, namun <strong>tidak menjamin</strong>{' '}
              bahwa tampilan selalu identik dengan keadaan provider pada detik yang sama. Untuk kebutuhan kritis,
              selalu verifikasi langsung ke dokumentasi resmi provider terkait.
            </p>
          </Section>

          <Section id="tanggung-jawab" title="Batasan Tanggung Jawab">
            <p>
              Pengguna bertanggung jawab untuk mengevaluasi kesesuaian model — termasuk spesifikasi dan
              kemampuannya — sebelum digunakan. Mpruy AI tidak bertanggung jawab atas kerugian, kegagalan
              output, ketidaksesuaian hasil, atau dampak lain yang timbul dari perubahan spesifikasi, perilaku,
              maupun ketersediaan model oleh provider.
            </p>
            <Callout variant="warn">
              Kualitas, keamanan, dan kebenaran keluaran model (<em>output</em>) sepenuhnya berada pada provider
              dan model yang bersangkutan. Pengguna dianjurkan melakukan validasi terhadap hasil sebelum
              menggunakannya di lingkungan produksi.
            </Callout>
          </Section>

          <Section id="kontak" title="Pertanyaan">
            <p>
              Jika Anda menemukan spesifikasi model yang tidak sesuai atau memiliki pertanyaan seputar disclaimer
              ini, hubungi tim Mpruy AI melalui kanal dukungan yang tersedia di dashboard Anda.
            </p>
            <p className="text-xs">
              Disclaimer ini merupakan bagian dari Ketentuan Layanan penggunaan platform Mpruy AI dan dapat
              diperbarui dari waktu ke waktu.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
