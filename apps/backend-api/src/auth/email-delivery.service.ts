import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class EmailDeliveryService {
  private transporter?: Transporter;

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const url = this.buildActionUrl('/verify-email', token);
    await this.send(
      email,
      'Verify your Go ’n Go account',
      `Verify your email address by opening this link:\n\n${url}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    );
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const url = this.buildActionUrl('/reset-password', token);
    await this.send(
      email,
      'Reset your Go ’n Go password',
      `Reset your password by opening this link:\n\n${url}\n\nThis link expires in 30 minutes. If you did not request a reset, you can ignore this email.`,
    );
  }

  async sendOtpEmail(email: string, code: string, purpose: 'login' | 'enable_mfa' | 'disable_mfa'): Promise<void> {
    const subject = purpose === 'login'
      ? 'Your Go ’n Go sign-in code'
      : 'Your Go ’n Go security code';
    await this.send(
      email,
      subject,
      `Your one-time code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    const from = process.env.EMAIL_FROM?.trim();
    if (!from || !process.env.SMTP_HOST?.trim()) {
      throw new ServiceUnavailableException('Email delivery is not configured.');
    }

    this.transporter ??= this.createTransporter();
    await this.transporter.sendMail({ from, to, subject, text });
  }

  private createTransporter(): Transporter {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      throw new ServiceUnavailableException('Email delivery is not configured.');
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Email delivery configuration is invalid.');
    }

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const secure = process.env.SMTP_SECURE === 'true';
    return createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private buildActionUrl(path: string, token: string): string {
    const origin = process.env.AUTH_PUBLIC_URL?.trim();
    if (!origin) {
      throw new ServiceUnavailableException('Authentication email links are not configured.');
    }

    let url: URL;
    try {
      url = new URL(path, origin);
    } catch (error) {
      throw new ServiceUnavailableException('Authentication email links are misconfigured.', {
        cause: error,
      });
    }
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Authentication email links must use HTTPS.');
    }
    url.searchParams.set('token', token);
    return url.toString();
  }
}
