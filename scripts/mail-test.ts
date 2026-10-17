/**
 * Uji konfigurasi email.
 *
 *   npm run mail:test                 # kirim ke ADMIN_EMAIL
 *   npm run mail:test -- kamu@mail.com
 *
 * Env dibaca dari .env (lihat script `mail:test` di package.json).
 */
import { sendMail, verifyMailer, resolveMailTransport, smtpHost, smtpPort } from '../src/lib/mailer';

async function main() {
  const to = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!to) {
    console.error('Target email kosong. Pakai: npx tsx scripts/mail-test.ts kamu@email.com');
    process.exit(1);
  }

  const transport = resolveMailTransport();
  console.log(`Transport: ${transport}${transport === 'smtp' ? ` (${smtpHost()}:${smtpPort()})` : ''}`);

  if (transport === 'smtp') {
    await verifyMailer();
    console.log('Koneksi SMTP OK (verify).');
  }

  await sendMail({
    to,
    subject: 'Tes email Mpruy AI',
    html: '<p>Jika Anda membaca ini, konfigurasi email sudah benar.</p>',
    text: 'Jika Anda membaca ini, konfigurasi email sudah benar.',
  });
  console.log(
    transport === 'console'
      ? 'Transport console: tidak ada email yang benar-benar dikirim (isi SMTP_PASS / RESEND_API_KEY).'
      : `Email tes terkirim ke ${to}.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});