import { Resend } from 'resend';

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY!);
  return client;
}

const from = () => process.env.EMAIL_FROM ?? 'noreply@mpruy.ai';
const base = () => process.env.APP_BASE_URL ?? 'http://localhost:3000';

export async function sendVerifyEmail(to: string, token: string): Promise<void> {
  const url = `${base()}/verify?token=${token}`;
  await resend().emails.send({
    from: from(),
    to,
    subject: 'Verifikasi email Mpruy AI',
    html: `<p>Klik tautan berikut untuk memverifikasi email Anda:</p><p><a href="${url}">${url}</a></p>`,
  });
}

export async function sendResetEmail(to: string, token: string): Promise<void> {
  const url = `${base()}/reset-password?token=${token}`;
  await resend().emails.send({
    from: from(),
    to,
    subject: 'Reset password Mpruy AI',
    html: `<p>Klik tautan berikut untuk mereset password Anda (berlaku 1 jam):</p><p><a href="${url}">${url}</a></p>`,
  });
}