import { createTransport, type Transporter } from "nodemailer";
import { Resend } from "resend";

/**
 * Pengirim email platform.
 *
 * Mode transport (dipilih otomatis bila `MAIL_TRANSPORT` tidak diisi):
 *   - `smtp`    : kirim lewat SMTP (default: Resend SMTP, lihat .env.example)
 *   - `api`     : kirim lewat Resend HTTP API (SDK `resend`)
 *   - `console` : tidak kirim, hanya log ke server (untuk dev tanpa kredensial)
 *
 * Auto-detect:
 *   1. SMTP_HOST + password (SMTP_PASS / RESEND_API_KEY) → `smtp`
 *   2. RESEND_API_KEY                                    → `api`
 *   3. selain itu                                        → `console`
 */

export type MailTransport = "smtp" | "api" | "console";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Cegah email dobel (dipakai Resend via header `Resend-Idempotency-Key`). */
  idempotencyKey?: string;
}

const env = (key: string): string | undefined =>
  process.env[key]?.trim() || undefined;

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

/** Resend SMTP memakai username `resend` dan password = API key. */
export const smtpHost = (): string => env("SMTP_HOST") ?? "smtp.resend.com";
export const smtpUser = (): string => env("SMTP_USER") ?? "resend";
export const smtpPass = (): string | undefined =>
  env("SMTP_PASS") ?? env("RESEND_API_KEY");

export const smtpPort = (): number => Number(env("SMTP_PORT") ?? 587);

/** Port 465/2465 = implicit SSL; 25/587/2587 = STARTTLS. */
const smtpSecure = (): boolean => {
  const explicit = env("SMTP_SECURE");
  if (explicit !== undefined) return asBool(explicit, false);
  return [465, 2465].includes(smtpPort());
};

export const mailFrom = (): string =>
  env("EMAIL_FROM") ?? "noreply@mpruy.ai.id";

/** `Nama <email@domain>` bila `EMAIL_FROM_NAME` diisi. */
export const mailFromHeader = (): string => {
  const name = env("EMAIL_FROM_NAME");
  const address = mailFrom();
  return name ? `"${name}" <${address}>` : address;
};

export function resolveMailTransport(): MailTransport {
  const explicit = env("MAIL_TRANSPORT")?.toLowerCase();
  if (explicit === "smtp" || explicit === "api" || explicit === "console")
    return explicit;
  if (env("SMTP_HOST") && smtpPass()) return "smtp";
  if (env("RESEND_API_KEY")) return "api";
  return "console";
}

let smtpClient: Transporter | null = null;

function smtp(): Transporter {
  if (smtpClient) return smtpClient;
  const pass = smtpPass();
  if (!pass) {
    throw new Error(
      "SMTP tidak dikonfigurasi: isi SMTP_PASS (atau RESEND_API_KEY) di env.",
    );
  }
  smtpClient = createTransport({
    host: smtpHost(),
    port: smtpPort(),
    secure: smtpSecure(),
    auth: { user: smtpUser(), pass },
    // STARTTLS wajib untuk port 25/587/2587.
    requireTLS: !smtpSecure(),
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: asBool(env("SMTP_ALLOW_SELF_SIGNED"), false)
        ? false
        : true,
    },
  });
  return smtpClient;
}

let apiClient: Resend | null = null;

function api(): Resend {
  if (apiClient) return apiClient;
  const key = env("RESEND_API_KEY");
  if (!key)
    throw new Error(
      "Resend API tidak dikonfigurasi: isi RESEND_API_KEY di env.",
    );
  apiClient = new Resend(key);
  return apiClient;
}

export function isMailerConfigured(): boolean {
  return resolveMailTransport() !== "console";
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const transport = resolveMailTransport();

  if (transport === "console") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Transport email tidak dikonfigurasi (set SMTP_* atau RESEND_API_KEY).",
      );
    }
    console.warn(
      `[mailer] transport email belum dikonfigurasi — email ke ${input.to} tidak dikirim. ` +
        `Subject: ${input.subject}`,
    );
    console.warn(
      `[mailer] ${input.html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()}`,
    );
    return;
  }

  if (transport === "smtp") {
    await smtp().sendMail({
      from: mailFromHeader(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      headers: input.idempotencyKey
        ? { "Resend-Idempotency-Key": input.idempotencyKey }
        : undefined,
    });
    return;
  }

  const { error } = await api().emails.send({
    from: mailFromHeader(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    reply_to: input.replyTo,
    headers: input.idempotencyKey
      ? { "Resend-Idempotency-Key": input.idempotencyKey }
      : undefined,
  });
  if (error) throw new Error(`Resend API error: ${error.message}`);
}

/** Cek konektivitas SMTP (dipakai untuk diagnosa manual). */
export async function verifyMailer(): Promise<boolean> {
  if (resolveMailTransport() !== "smtp") return false;
  await smtp().verify();
  return true;
}
