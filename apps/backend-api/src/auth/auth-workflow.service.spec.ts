import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthRateLimitService, AuthRateLimitException } from './auth-rate-limit.service';
import { AuthWorkflowService } from './auth-workflow.service';
import { EmailDeliveryService } from './email-delivery.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';

describe('AuthWorkflowService', () => {
  let service: AuthWorkflowService;
  let testingModule: TestingModule;
  const user = {
    id: 'user-1',
    email: 'rider@example.com',
    fullName: 'Sample Rider',
    role: 'rider',
    passwordHash: 'argon2-hash',
    emailVerifiedAt: new Date(),
    authVersion: 0,
  };
  const metadata = { ip: '192.0.2.10', userAgent: 'GoNGo Test' };
  const jwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
    verify: jest.fn().mockReturnValue({ sub: user.id, type: 'refresh' }),
  };
  const dataSource = {
    transaction: jest.fn(async (run: (manager: unknown) => Promise<unknown>) =>
      run({
        getRepository: () => ({
          create: (record: unknown) => record,
          save: jest.fn().mockImplementation(async (record) => ({ ...record, id: 'rotated-session-1' })),
          findOne: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          increment: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      }),
    ),
  };
  const rateLimit = {
    key: jest.fn((scope: string, value: string) => `${scope}:${value}`),
    assertAllowed: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    consumeLoginAttempt: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const emailDelivery = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    increment: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const refreshTokens = {
    create: jest.fn((value) => value),
    save: jest.fn().mockImplementation(async (record) => ({ ...record, id: 'rotated-session-1' })),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const emailVerificationTokens = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const passwordResetTokens = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const otpVerifications = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
  };
  const mfaSettings = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
    findOneBy: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const userProfiles = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
  };
  const securityEvents = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(argon2, 'hash').mockResolvedValue('argon2-hash');
    jest.spyOn(argon2, 'verify').mockResolvedValue(true);
    jwt.sign.mockReturnValue('signed-token');
    jwt.verify.mockReturnValue({ sub: user.id, type: 'refresh' });
    dataSource.transaction.mockImplementation(async (run) =>
      run({
        getRepository: () => ({
          create: (record: unknown) => record,
          save: jest.fn().mockImplementation(async (record) => ({ ...record, id: 'rotated-session-1' })),
          findOne: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          increment: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      }),
    );
    rateLimit.key.mockImplementation((scope, value) => `${scope}:${value}`);
    rateLimit.assertAllowed.mockResolvedValue(undefined);
    rateLimit.consume.mockResolvedValue(undefined);
    rateLimit.consumeLoginAttempt.mockResolvedValue(undefined);
    rateLimit.clear.mockResolvedValue(undefined);
    emailDelivery.sendVerificationEmail.mockResolvedValue(undefined);
    emailDelivery.sendPasswordResetEmail.mockResolvedValue(undefined);
    emailDelivery.sendOtpEmail.mockResolvedValue(undefined);
    users.create.mockImplementation((value) => value);
    users.save.mockResolvedValue(user);
    users.findOne.mockResolvedValue(user);
    users.update.mockResolvedValue({ affected: 1 });
    users.increment.mockResolvedValue({ affected: 1 });
    refreshTokens.create.mockImplementation((value) => value);
    refreshTokens.save.mockResolvedValue({ id: 'session-1' });
    refreshTokens.findOne.mockResolvedValue(null);
    refreshTokens.find.mockResolvedValue([]);
    refreshTokens.update.mockResolvedValue({ affected: 1 });
    emailVerificationTokens.create.mockImplementation((value) => value);
    emailVerificationTokens.save.mockResolvedValue({});
    emailVerificationTokens.findOne.mockResolvedValue(null);
    emailVerificationTokens.update.mockResolvedValue({ affected: 1 });
    passwordResetTokens.create.mockImplementation((value) => value);
    passwordResetTokens.save.mockResolvedValue({});
    passwordResetTokens.findOne.mockResolvedValue(null);
    passwordResetTokens.update.mockResolvedValue({ affected: 1 });
    otpVerifications.create.mockImplementation((value) => value);
    otpVerifications.save.mockResolvedValue({});
    otpVerifications.findOne.mockResolvedValue(null);
    otpVerifications.update.mockResolvedValue({ affected: 1 });
    mfaSettings.create.mockImplementation((value) => value);
    mfaSettings.findOneBy.mockResolvedValue(null);
    mfaSettings.save.mockResolvedValue({});
    mfaSettings.update.mockResolvedValue({ affected: 1 });
    userProfiles.create.mockImplementation((value) => value);
    userProfiles.save.mockResolvedValue({});
    securityEvents.create.mockImplementation((value) => value);
    securityEvents.save.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        AuthWorkflowService,
        { provide: JwtService, useValue: jwt },
        { provide: DataSource, useValue: dataSource },
        { provide: AuthRateLimitService, useValue: rateLimit },
        { provide: EmailDeliveryService, useValue: emailDelivery },
        { provide: 'USER_REPOSITORY', useValue: users },
        { provide: 'REFRESH_TOKEN_REPOSITORY', useValue: refreshTokens },
        { provide: 'EMAIL_VERIFICATION_TOKEN_REPOSITORY', useValue: emailVerificationTokens },
        { provide: 'PASSWORD_RESET_TOKEN_REPOSITORY', useValue: passwordResetTokens },
        { provide: 'OTP_VERIFICATION_REPOSITORY', useValue: otpVerifications },
        { provide: 'MFA_SETTINGS_REPOSITORY', useValue: mfaSettings },
        { provide: 'USER_PROFILE_REPOSITORY', useValue: userProfiles },
        { provide: 'AUTH_SECURITY_EVENT_REPOSITORY', useValue: securityEvents },
      ],
    }).compile();
    service = testingModule.get(AuthWorkflowService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.restoreAllMocks();
  });

  it('creates an unverified rider account and sends a single-use verification link', async () => {
    await service.register(
      {
        fullName: 'Sample Rider',
        email: 'Rider@Example.com',
        mobileNumber: '012-345 6789',
        countryCode: '+60',
        password: 'StrongPass!234',
        confirmPassword: 'StrongPass!234',
        termsAccepted: true,
      },
      metadata,
    );

    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'rider@example.com',
        role: 'rider',
        emailVerifiedAt: null,
        mobileNumber: '0123456789',
        countryCode: '+60',
      }),
    );
    expect(userProfiles.save).toHaveBeenCalledTimes(1);
    const sentVerificationToken = emailDelivery.sendVerificationEmail.mock.calls[0][1];
    expect(emailVerificationTokens.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
    expect(emailVerificationTokens.save.mock.calls[0][0].tokenHash).not.toBe(
      sentVerificationToken,
    );
    expect(emailDelivery.sendVerificationEmail).toHaveBeenCalledWith(
      user.email,
      expect.any(String),
    );
  });

  it('returns normally for duplicate emails without creating or disclosing another account', async () => {
    users.save.mockRejectedValueOnce({
      driverError: { code: '23505' },
    });

    await expect(
      service.register(
        {
          fullName: 'Sample Rider',
          email: user.email,
          mobileNumber: '123456789',
          countryCode: '+60',
          password: 'StrongPass!234',
          confirmPassword: 'StrongPass!234',
          termsAccepted: true,
        },
        metadata,
      ),
    ).resolves.toBeUndefined();
    expect(users.save).toHaveBeenCalledTimes(1);
    expect(userProfiles.save).not.toHaveBeenCalled();
    expect(emailDelivery.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('rejects weak passwords and unaccepted terms before account creation', async () => {
    await expect(
      service.register(
        {
          fullName: 'Sample Rider',
          email: user.email,
          mobileNumber: '123456789',
          countryCode: '+60',
          password: 'weak',
          confirmPassword: 'weak',
          termsAccepted: true,
        },
        metadata,
      ),
    ).rejects.toThrow('Use 12–128 characters');
    expect(users.save).not.toHaveBeenCalled();

    await expect(
      service.register(
        {
          fullName: 'Sample Rider',
          email: user.email,
          mobileNumber: '123456789',
          countryCode: '+60',
          password: 'StrongPass!234',
          confirmPassword: 'StrongPass!234',
          termsAccepted: false,
        },
        metadata,
      ),
    ).rejects.toThrow('Terms and Conditions');
  });

  it('authenticates verified accounts and creates only hashed refresh-token records', async () => {
    const result = await service.login(user.email, 'StrongPass!234', metadata);

    expect(result).toMatchObject({
      mfaRequired: false,
      user: { id: user.id, email: user.email },
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
    });
    expect(refreshTokens.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenHash: expect.any(String),
        userAgent: metadata.userAgent,
      }),
    );
    expect(refreshTokens.save.mock.calls[0][0].tokenHash).not.toBe('signed-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'session-1', type: 'access' }),
      { expiresIn: '15m' },
    );
    expect(rateLimit.clear).toHaveBeenCalledWith(`login:${user.email}|${metadata.ip}`);
    expect(rateLimit.clear).toHaveBeenCalledWith(`login-account:${user.email}`);
  });

  it('rejects invalid credentials and counts failed attempts by account and IP', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValueOnce(false);

    await expect(
      service.login(user.email, 'WrongPass!234', metadata),
    ).rejects.toThrow('Invalid email or password.');
    expect(rateLimit.consumeLoginAttempt).toHaveBeenCalledWith(
      `login:${user.email}|${metadata.ip}`,
    );
    expect(rateLimit.assertAllowed).toHaveBeenCalledWith(`login-account:${user.email}`);
    expect(rateLimit.consumeLoginAttempt).toHaveBeenCalledWith(
      `login-account:${user.email}`,
    );
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login_failed', userId: user.id }),
    );
  });

  it('counts failures against the account across different source IPs', async () => {
    jest.spyOn(argon2, 'verify').mockResolvedValue(false);
    const secondIpMetadata = { ...metadata, ip: '198.51.100.20' };

    await expect(
      service.login(user.email, 'WrongPass!234', metadata),
    ).rejects.toThrow('Invalid email or password.');
    await expect(
      service.login(user.email, 'WrongPass!234', secondIpMetadata),
    ).rejects.toThrow('Invalid email or password.');

    expect(rateLimit.consumeLoginAttempt).toHaveBeenNthCalledWith(
      1,
      `login:${user.email}|${metadata.ip}`,
    );
    expect(rateLimit.consumeLoginAttempt).toHaveBeenNthCalledWith(
      2,
      `login-account:${user.email}`,
    );
    expect(rateLimit.consumeLoginAttempt).toHaveBeenNthCalledWith(
      3,
      `login:${user.email}|${secondIpMetadata.ip}`,
    );
    expect(rateLimit.consumeLoginAttempt).toHaveBeenNthCalledWith(
      4,
      `login-account:${user.email}`,
    );
  });

  it('rejects login while the account-level progressive lockout is active', async () => {
    rateLimit.assertAllowed.mockRejectedValueOnce(
      new AuthRateLimitException(900),
    );

    await expect(
      service.login(user.email, 'StrongPass!234', {
        ...metadata,
        ip: '198.51.100.20',
      }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 900 });

    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('does not create sessions for unverified accounts', async () => {
    users.findOne.mockResolvedValueOnce({ ...user, emailVerifiedAt: null });

    await expect(
      service.login(user.email, 'StrongPass!234', metadata),
    ).rejects.toThrow('Invalid email or password.');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('stops a login attempt when the progressive lockout is active', async () => {
    rateLimit.consumeLoginAttempt.mockRejectedValueOnce(
      new AuthRateLimitException(900),
    );

    await expect(
      service.login(user.email, 'StrongPass!234', metadata),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 900 });
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('requires an OTP for MFA-enabled accounts and consumes it once', async () => {
    mfaSettings.findOneBy.mockResolvedValueOnce({ emailOtpEnabled: true });
    otpVerifications.save.mockImplementationOnce(async (record) => ({
      ...record,
      id: 'challenge-1',
      createdAt: new Date(),
    }));

    const login = await service.login(user.email, 'StrongPass!234', metadata);
    expect(login).toMatchObject({ mfaRequired: true, challengeId: 'challenge-1' });

    const sentCode = emailDelivery.sendOtpEmail.mock.calls[0][1] as string;
    const storedOtp = otpVerifications.save.mock.calls[0][0];
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(storedOtp.codeHash).not.toBe(sentCode);
    expect(storedOtp.expiresAt.getTime()).toBeGreaterThan(Date.now());

    otpVerifications.findOne.mockResolvedValueOnce({
      id: 'challenge-1',
      userId: user.id,
      user,
      purpose: 'login',
      codeHash: storedOtp.codeHash,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      usedAt: null,
    });
    const verified = await service.verifyOtp('challenge-1', sentCode, metadata);
    expect(verified).toMatchObject({ mfaRequired: false, user: { id: user.id } });
    expect(otpVerifications.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'challenge-1' }),
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it('rejects expired OTPs and prevents replay', async () => {
    otpVerifications.findOne.mockResolvedValueOnce({
      id: 'expired',
      userId: user.id,
      user,
      purpose: 'login',
      codeHash: 'hash',
      expiresAt: new Date(Date.now() - 1),
      attemptCount: 0,
      usedAt: null,
    });
    await expect(
      service.verifyOtp('expired', '123456', metadata),
    ).rejects.toThrow('invalid or expired');
    expect(refreshTokens.save).not.toHaveBeenCalled();

    otpVerifications.findOne.mockResolvedValueOnce({
      id: 'replayed',
      userId: user.id,
      user,
      purpose: 'login',
      codeHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      usedAt: new Date(),
    });
    await expect(
      service.verifyOtp('replayed', '123456', metadata),
    ).rejects.toThrow('invalid or expired');
    expect(refreshTokens.save).not.toHaveBeenCalled();

    otpVerifications.findOne.mockResolvedValueOnce({
      id: 'attempt-limit',
      userId: user.id,
      user,
      purpose: 'login',
      codeHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 5,
      usedAt: null,
    });
    await expect(
      service.verifyOtp('attempt-limit', '123456', metadata),
    ).rejects.toThrow('invalid or expired');
    expect(refreshTokens.save).not.toHaveBeenCalled();
  });

  it('returns the same password-reset response for an unknown account', async () => {
    users.findOne.mockResolvedValueOnce(null);

    await expect(
      service.requestPasswordReset('unknown@example.com', metadata),
    ).resolves.toBeUndefined();
    expect(emailDelivery.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('verifies an email in the same transaction that consumes its token', async () => {
    const token = 'verification-token-with-long-entropy-123456';
    emailVerificationTokens.findOne.mockResolvedValueOnce({
      id: 'verification-1',
      userId: user.id,
      user: { ...user, emailVerifiedAt: null },
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.verifyEmail(token, metadata);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'email_verified', userId: user.id }),
    );
  });

  it('rejects expired email verification links without verifying the account', async () => {
    emailVerificationTokens.findOne.mockResolvedValueOnce({
      id: 'expired-verification',
      userId: user.id,
      user: { ...user, emailVerifiedAt: null },
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(
      service.verifyEmail('expired-verification-token-with-entropy', metadata),
    ).rejects.toThrow('invalid or expired');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('resets the password and revokes sessions transactionally', async () => {
    passwordResetTokens.findOne.mockResolvedValueOnce({
      id: 'reset-1',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValueOnce(user);

    await service.resetPassword(
      'reset-token-with-long-entropy-123456',
      'NewStrongPass!456',
      'NewStrongPass!456',
      metadata,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(passwordResetTokens.update).not.toHaveBeenCalled();
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_reset_completed', userId: user.id }),
    );
  });

  it('invalidates pending password-reset tokens when changing a password', async () => {
    const resetTokenRepository = {
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    const refreshTokenRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PasswordResetToken) {
          return resetTokenRepository;
        }
        if (entity === RefreshToken) {
          return refreshTokenRepository;
        }
        if (entity === User) {
          return userRepository;
        }
        throw new Error('Unexpected repository in password-change transaction.');
      }),
    };
    dataSource.transaction.mockImplementationOnce(async (run) => run(manager));

    await service.changePassword(
      user.id,
      'StrongPass!234',
      'NewStrongPass!456',
      'NewStrongPass!456',
      metadata,
    );

    expect(resetTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        usedAt: expect.any(Object),
      }),
      { usedAt: expect.any(Date) },
    );
    expect(refreshTokenRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'password_changed', userId: user.id }),
    );
  });

  it('rotates refresh tokens in a transaction and revokes sessions on reuse', async () => {
    const activeRecord = {
      id: 'refresh-1',
      userId: user.id,
      user,
      tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    refreshTokens.findOne.mockResolvedValueOnce(activeRecord);
    const sessionRepository = {
      findOne: jest.fn().mockResolvedValue(activeRecord),
      create: (record: unknown) => record,
      save: jest.fn().mockResolvedValue({ id: 'rotated-session-1' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource.transaction.mockImplementationOnce((run) =>
      run({ getRepository: () => sessionRepository }),
    );
    const rotated = await service.refresh('valid-refresh-token-with-long-entropy', metadata);
    expect(rotated).toMatchObject({ user: { id: user.id }, refreshToken: 'signed-token' });
    expect(sessionRepository.findOne).toHaveBeenCalledWith({
      where: { id: activeRecord.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    const replayedRecord = {
      id: 'refresh-1',
      userId: user.id,
      user,
      replacementTokenHash: 'replacement-hash',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    refreshTokens.findOne.mockResolvedValueOnce(replayedRecord);
    dataSource.transaction.mockImplementationOnce((run) =>
      run({
        getRepository: () => ({
          findOne: jest.fn().mockResolvedValue(replayedRecord),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      }),
    );
    await expect(
      service.refresh('replayed-refresh-token-with-long-entropy', metadata),
    ).rejects.toThrow('Refresh token reuse detected.');
    expect(dataSource.transaction).toHaveBeenCalledTimes(3);
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'refresh_token_reuse_detected' }),
    );
  });

  it('serializes simultaneous refreshes and revokes the session when the old token is replayed', async () => {
    const activeRecord = {
      id: 'refresh-1',
      userId: user.id,
      user,
      tokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    refreshTokens.findOne.mockResolvedValue(activeRecord);

    let storedRecord: Record<string, unknown> = { ...activeRecord };
    let activeSessionCount = 1;
    let replacementCount = 0;
    let transactionTail: Promise<unknown> = Promise.resolve();
    const sessionRepository = {
      findOne: jest.fn(async () => ({ ...storedRecord })),
      create: (record: unknown) => record,
      save: jest.fn(async (record: { userId: string }) => {
        replacementCount += 1;
        activeSessionCount += 1;
        return { ...record, id: `rotated-session-${replacementCount}` };
      }),
      update: jest.fn(
        async (where: Record<string, unknown>, updates: Record<string, unknown>) => {
          if ('id' in where) {
            if (storedRecord.revokedAt) {
              return { affected: 0 };
            }
            storedRecord = { ...storedRecord, ...updates };
            return { affected: 1 };
          }
          activeSessionCount = 0;
          return { affected: 1 };
        },
      ),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource.transaction.mockImplementation(async (run) => {
      const current = transactionTail.then(() =>
        run({ getRepository: () => sessionRepository }),
      );
      transactionTail = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    });

    const results = await Promise.allSettled([
      service.refresh('simultaneous-refresh-token-with-long-entropy', metadata),
      service.refresh('simultaneous-refresh-token-with-long-entropy', metadata),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(replacementCount).toBe(1);
    expect(activeSessionCount).toBe(0);
    expect(sessionRepository.findOne).toHaveBeenCalledTimes(2);
    expect(sessionRepository.findOne).toHaveBeenCalledWith({
      where: { id: activeRecord.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(securityEvents.save).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'refresh_token_reuse_detected', userId: user.id }),
    );
  });

  it('revokes an individual session and all sessions on logout-all', async () => {
    await service.revokeSession(user.id, 'session-1');
    expect(refreshTokens.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1', userId: user.id }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );

    await service.logoutAll(user.id);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('revokes refresh tokens on logout and rejects unknown tokens', async () => {
    refreshTokens.findOne.mockResolvedValueOnce(null);
    await expect(
      service.logout('unknown-refresh-token-with-long-entropy'),
    ).rejects.toThrow(UnauthorizedException);

    refreshTokens.findOne.mockResolvedValueOnce({
      id: 'refresh-1',
      userId: user.id,
      user,
      revokedAt: null,
    });
    await service.logout('valid-refresh-token-with-long-entropy');
    expect(refreshTokens.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'refresh-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
