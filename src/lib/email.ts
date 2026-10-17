import { sendMail } from './mailer';

const base = () => process.env.APP_BASE_URL ?? 'http://localhost:3000';

export async function sendVerifyEmail(to: string, token: string): Promise<void> {
  const url = `${base()}/verify?token=${token}`;
  await sendMail({
    to,
    subject: 'Verifikasi email Mpruy AI',
    html: `<p>Klik tautan berikut untuk memverifikasi email Anda:</p><p><a href="${url}">${url}</a></p>`,
    text: `Verifikasi email Anda: ${url}`,
    idempotencyKey: `verify/${token.slice(0, 24)}`,
  });
}

export async function sendResetEmail(to: string, token: string): Promise<void> {
  const url = `${base()}/reset-password?token=${token}`;
  await sendMail({
    to,
    subject: 'Reset password Mpruy AI',
    html: `<p>Klik tautan berikut untuk mereset password Anda (berlaku 1 jam):</p><p><a href="${url}">${url}</a></p>`,
    text: `Reset password Anda (berlaku 1 jam): ${url}`,
    idempotencyKey: `reset/${token.slice(0, 24)}`,
  });
}