import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import { otpEmail } from './otp';

// Pengiriman lewat SMTP aplikasi (pola scripts/mailer.ts). Kredensial hanya
// dibaca di server; tidak ada varian NEXT_PUBLIC_*.
let cached: Transporter | null = null;

function smtpTransport(): Transporter {
  const user = z.string().email().parse(process.env.SMTP_EMAIL);
  const pass = z.string().min(1).parse(process.env.SMTP_PASSWORD);
  cached ??= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return cached;
}

/** true bila terkirim. Kredensial SMTP hilang/keliru tidak boleh membuat aksi gagal dengan pesan internal. */
export async function sendOtpEmail(to: string, code: string, className: string): Promise<boolean> {
  try {
    const transport = smtpTransport();
    await transport.sendMail({
      from: { name: className, address: process.env.SMTP_EMAIL! },
      to,
      ...otpEmail(code, className),
    });
    return true;
  } catch (error) {
    console.error('sendOtpEmail', error instanceof Error ? error.name : 'unknown');
    return false;
  }
}
