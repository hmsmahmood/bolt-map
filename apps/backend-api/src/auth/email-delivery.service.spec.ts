import * as nodemailer from 'nodemailer';
import { EmailDeliveryService } from './email-delivery.service';

const smtpEnvironmentKeys = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'EMAIL_FROM',
] as const;

describe('EmailDeliveryService', () => {
  let createTransportSpy: jest.SpyInstance;
  let previousEnvironment: Record<string, string | undefined>;

  beforeEach(() => {
    previousEnvironment = Object.fromEntries(
      smtpEnvironmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.EMAIL_FROM = 'Go n Go <no-reply@example.test>';

    const transport = nodemailer.createTransport({ jsonTransport: true });
    createTransportSpy = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue(transport);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of smtpEnvironmentKeys) {
      const value = previousEnvironment[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('requires STARTTLS for SMTP transports without implicit TLS', async () => {
    await new EmailDeliveryService().sendOtpEmail(
      'rider@example.test',
      '123456',
      'login',
    );

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        requireTLS: true,
      }),
    );
  });

  it('uses implicit TLS without requiring STARTTLS negotiation', async () => {
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';

    await new EmailDeliveryService().sendOtpEmail(
      'rider@example.test',
      '123456',
      'login',
    );

    expect(createTransportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        requireTLS: false,
      }),
    );
  });
});
