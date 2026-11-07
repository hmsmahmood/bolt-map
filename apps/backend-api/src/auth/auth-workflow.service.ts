import * as argon2 from 'argon2';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import {
  AuthRateLimitException,
  AuthRateLimitService,
} from './auth-rate-limit.service';
import { EmailDeliveryService } from './email-delivery.service';
import { AuthSecurityEvent } from '../entities/auth-security-event.entity';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { MfaSettings } from '../entities/mfa-settings.entity';
import { OtpPurpose, OtpVerification } from '../entities/otp-verification.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { User } from '../entities/user.entity';

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export interface RegistrationInput {
  fullName: string;
  email: string;
  mobileNumber: string;
  countryCode: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

export interface RequestMetadata {
  ip: string;
  userAgent?: string;
}

export interface PublicAuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthWorkflowService {
  private readonly otpHmacSecret =
    process.env.JWT_SECRET?.trim() || randomBytes(32).toString('hex');
  private readonly dummyPasswordHash = argon2.hash(
    randomBytes(32).toString('hex'),
    PASSWORD_HASH_OPTIONS,
  );

  constructor(
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly rateLimit: AuthRateLimitService,
    private readonly emailDelivery: EmailDeliveryService,
    @Inject('USER_REPOSITORY')
    private readonly users: Repository<User>,
    @Inject('REFRESH_TOKEN_REPOSITORY')
    private readonly refreshTokens: Repository<RefreshToken>,
    @Inject('EMAIL_VERIFICATION_TOKEN_REPOSITORY')
    private readonly emailVerificationTokens: Repository<EmailVerificationToken>,
    @Inject('PASSWORD_RESET_TOKEN_REPOSITORY')
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
    @Inject('OTP_VERIFICATION_REPOSITORY')
    private readonly otpVerifications: Repository<OtpVerification>,
    @Inject('MFA_SETTINGS_REPOSITORY')
    private readonly mfaSettings: Repository<MfaSettings>,
    @Inject('USER_PROFILE_REPOSITORY')
    private readonly userProfiles: Repository<UserProfile>,
    @Inject('AUTH_SECURITY_EVENT_REPOSITORY')
    private readonly securityEvents: Repository<AuthSecurityEvent>,
  ) {}

  async register(input: RegistrationInput, metadata: RequestMetadata): Promise<void> {
    await this.rateLimit.consume(this.rateLimit.key('register:ip', metadata.ip), 10, 3600);
    await this.rateLimit.consume(
      this.rateLimit.key('register:email', input.email),
      3,
      3600,
    );
    this.validatePassword(input.password, input.fullName, input.email);
    const fullName = input.fullName.trim();
    if (fullName.length < 2 || fullName.length > 120) {
      throw new BadRequestException('Registration details are invalid.');
    }
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Registration details are invalid.');
    }
    if (input.termsAccepted !== true) {
      throw new BadRequestException('Terms and Conditions must be accepted.');
    }

    const email = input.email.trim().toLowerCase();
    const countryCode = input.countryCode.trim();
    const mobileNumber = input.mobileNumber.replace(/[\s()-]/g, '');
    const nationalNumber = mobileNumber.replace(/^0+/, '');
    const internationalNumber = `${countryCode}${nationalNumber}`;
    if (
      !/^\+[1-9]\d{0,2}$/.test(countryCode) ||
      !/^\d{6,14}$/.test(mobileNumber) ||
      !/^\+[1-9]\d{7,14}$/.test(internationalNumber)
    ) {
      throw new BadRequestException('Registration details are invalid.');
    }

    const passwordHash = await argon2.hash(input.password, PASSWORD_HASH_OPTIONS);
    let user: User;
    try {
      user = await this.users.save(
        this.users.create({
          email,
          passwordHash,
          fullName,
          mobileNumber,
          countryCode,
          role: 'rider',
          termsAcceptedAt: new Date(),
          emailVerifiedAt: null,
        }),
      );
    } catch (error) {
      if (this.isDuplicateEmail(error)) {
        return;
      }
      throw error;
    }

    await this.userProfiles.save(this.userProfiles.create({ userId: user.id }));
    await this.issueEmailVerification(user);
    await this.recordEvent('registration_requested', user.id, metadata.ip);
  }

  async verifyEmail(token: string, metadata: RequestMetadata): Promise<void> {
    await this.rateLimit.consume(
      this.rateLimit.key('verify-token:ip', metadata.ip),
      10,
      300,
    );
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      throw new UnauthorizedException('The verification link is invalid or expired.');
    }
    const record = await this.emailVerificationTokens.findOne({
      where: { tokenHash: this.hash(token), usedAt: IsNull() },
      relations: { user: true },
    });
    if (!record || record.expiresAt <= new Date() || record.user.emailVerifiedAt) {
      throw new UnauthorizedException('The verification link is invalid or expired.');
    }

    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const consumed = await manager.getRepository(EmailVerificationToken).update(
        { id: record.id, usedAt: IsNull(), expiresAt: MoreThan(now) },
        { usedAt: now },
      );
      if (consumed.affected !== 1) {
        throw new UnauthorizedException('The verification link is invalid or expired.');
      }

      const verified = await manager.getRepository(User).update(
        { id: record.userId, emailVerifiedAt: IsNull() },
        { emailVerifiedAt: now },
      );
      if (verified.affected !== 1) {
        throw new UnauthorizedException('The verification link is invalid or expired.');
      }
    });
    await this.recordEvent('email_verified', record.userId);
  }

  async resendVerificationEmail(emailAddress: string, metadata: RequestMetadata): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    await this.rateLimit.consume(this.rateLimit.key('verify:ip', metadata.ip), 5, 3600);
    await this.rateLimit.consume(this.rateLimit.key('verify:email', email), 3, 3600);

    const user = await this.users.findOne({ where: { email } });
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailVerification(user);
    }
  }

  async login(
    emailAddress: string,
    password: string,
    metadata: RequestMetadata,
  ): Promise<
    | { mfaRequired: true; challengeId: string; expiresAt: string }
    | { mfaRequired: false; user: PublicAuthUser; accessToken: string; refreshToken: string; expiresAt: string }
  > {
    const email = emailAddress.trim().toLowerCase();
    const rateKey = this.rateLimit.key('login', `${email}|${metadata.ip}`);
    const accountRateKey = this.rateLimit.key('login-account', email);
    await this.rateLimit.consumeLoginAttempt(rateKey);

    const user = await this.users.findOne({ where: { email } });
    if (user) {
      await this.rateLimit.assertAllowed(accountRateKey);
    }

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(
        user?.passwordHash ?? (await this.dummyPasswordHash),
        password,
      );
    } catch {
      passwordMatches = false;
    }

    if (!user || !passwordMatches) {
      await this.recordEvent('login_failed', user?.id ?? null, metadata.ip);
      if (user) {
        await this.rateLimit.consumeLoginAttempt(accountRateKey);
      }
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.rateLimit.clear(rateKey);
    await this.rateLimit.clear(accountRateKey);
    const mfa = await this.mfaSettings.findOneBy({ userId: user.id });
    if (mfa?.emailOtpEnabled) {
      const challenge = await this.createOtp(user, 'login', metadata);
      return {
        mfaRequired: true,
        challengeId: challenge.id,
        expiresAt: challenge.expiresAt.toISOString(),
      };
    }

    return { mfaRequired: false, ...(await this.issueSession(user, metadata)) };
  }

  async verifyOtp(
    challengeId: string,
    code: string,
    metadata: RequestMetadata,
  ): Promise<
    | { mfaRequired: false; user: PublicAuthUser; accessToken: string; refreshToken: string; expiresAt: string }
    | { mfaEnabled: boolean }
  > {
    await this.rateLimit.consume(this.rateLimit.key('otp:verify:ip', metadata.ip), 10, 300);
    if (!/^\d{6}$/.test(code)) {
      throw new UnauthorizedException('The one-time code is invalid or expired.');
    }
    const challenge = await this.otpVerifications.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= new Date() ||
      challenge.attemptCount >= 5
    ) {
      throw new UnauthorizedException('The one-time code is invalid or expired.');
    }

    const submittedHash = this.otpHash(code);
    const matches = this.constantTimeEqual(challenge.codeHash, submittedHash);
    if (!matches) {
      await this.otpVerifications
        .createQueryBuilder()
        .update(OtpVerification)
        .set({
          attemptCount: () => 'attempt_count + 1',
          usedAt: () => 'CASE WHEN attempt_count + 1 >= 5 THEN NOW() ELSE used_at END',
        })
        .where('id = :id AND used_at IS NULL AND expires_at > NOW() AND attempt_count < 5', {
          id: challenge.id,
        })
        .execute();
      await this.recordEvent('otp_failed', challenge.userId, metadata.ip);
      throw new UnauthorizedException('The one-time code is invalid or expired.');
    }

    const consumed = await this.otpVerifications.update(
      {
        id: challenge.id,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
        attemptCount: LessThan(5),
      },
      { usedAt: new Date() },
    );
    if (consumed.affected !== 1) {
      throw new UnauthorizedException('The one-time code is invalid or expired.');
    }

    if (challenge.purpose === 'enable_mfa') {
      await this.mfaSettings.save(
        this.mfaSettings.create({ userId: challenge.userId, emailOtpEnabled: true }),
      );
      await this.recordEvent('mfa_enabled', challenge.userId, metadata.ip);
      return { mfaEnabled: true };
    }
    if (challenge.purpose === 'disable_mfa') {
      await this.mfaSettings.update(
        { userId: challenge.userId },
        { emailOtpEnabled: false },
      );
      await this.recordEvent('mfa_disabled', challenge.userId, metadata.ip);
      return { mfaEnabled: false };
    }

    return { mfaRequired: false, ...(await this.issueSession(challenge.user, metadata)) };
  }

  async resendOtp(challengeId: string, metadata: RequestMetadata): Promise<{ challengeId: string; expiresAt: string }> {
    await this.rateLimit.consume(this.rateLimit.key('otp:resend:ip', metadata.ip), 5, 300);
    const previous = await this.otpVerifications.findOne({
      where: { id: challengeId },
      relations: { user: true },
    });
    if (!previous || previous.usedAt || previous.expiresAt <= new Date()) {
      throw new UnauthorizedException('The one-time code is invalid or expired.');
    }
    const cooldown = RESEND_COOLDOWN_MS - (Date.now() - previous.createdAt.getTime());
    if (cooldown > 0) {
      throw new AuthRateLimitException(Math.ceil(cooldown / 1000));
    }

    const challenge = await this.createOtp(previous.user, previous.purpose, metadata);
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() };
  }

  async requestPasswordReset(emailAddress: string, metadata: RequestMetadata): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    await this.rateLimit.consume(this.rateLimit.key('password-reset:ip', metadata.ip), 5, 3600);
    await this.rateLimit.consume(this.rateLimit.key('password-reset:email', email), 3, 3600);

    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.emailVerifiedAt) {
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.passwordResetTokens.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    await this.passwordResetTokens.save(
      this.passwordResetTokens.create({
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      }),
    );
    await this.emailDelivery.sendPasswordResetEmail(user.email, token);
    await this.recordEvent('password_reset_requested', user.id, metadata.ip);
  }

  async resetPassword(
    token: string,
    password: string,
    confirmPassword: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.rateLimit.consume(
      this.rateLimit.key('password-reset:complete:ip', metadata.ip),
      10,
      3600,
    );
    this.validatePassword(password);
    if (password !== confirmPassword) {
      throw new BadRequestException('The reset link or password is invalid.');
    }
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) {
      throw new UnauthorizedException('The reset link or password is invalid.');
    }
    const reset = await this.passwordResetTokens.findOne({
      where: { tokenHash: this.hash(token), usedAt: IsNull() },
    });
    if (!reset || reset.expiresAt <= new Date()) {
      throw new UnauthorizedException('The reset link or password is invalid.');
    }

    const user = await this.users.findOne({ where: { id: reset.userId } });
    if (!user) {
      throw new UnauthorizedException('The reset link or password is invalid.');
    }
    this.validatePassword(password, user.fullName, user.email);
    const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);

    await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const consumed = await manager.getRepository(PasswordResetToken).update(
        { id: reset.id, usedAt: IsNull(), expiresAt: MoreThan(now) },
        { usedAt: now },
      );
      if (consumed.affected !== 1) {
        throw new UnauthorizedException('The reset link or password is invalid.');
      }
      const updated = await manager.getRepository(User).update(
        { id: reset.userId },
        { passwordHash },
      );
      if (updated.affected !== 1) {
        throw new UnauthorizedException('The reset link or password is invalid.');
      }
      await this.revokeAllSessions(reset.userId, manager);
    });
    await this.recordEvent('password_reset_completed', reset.userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    password: string,
    confirmPassword: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !(await this.verifyPassword(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    this.validatePassword(password, user.fullName, user.email);
    if (password !== confirmPassword) {
      throw new BadRequestException('New password confirmation does not match.');
    }
    const passwordHash = await argon2.hash(password, PASSWORD_HASH_OPTIONS);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PasswordResetToken).update(
        { userId: user.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      await manager.getRepository(User).update(
        { id: user.id },
        { passwordHash },
      );
      await this.revokeAllSessions(user.id, manager);
    });
    await this.recordEvent('password_changed', user.id, metadata.ip);
  }

  async requestMfaChange(
    userId: string,
    purpose: 'enable_mfa' | 'disable_mfa',
    metadata: RequestMetadata,
  ): Promise<{ challengeId: string; expiresAt: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Authentication is required.');
    }
    const settings = await this.mfaSettings.findOneBy({ userId });
    if (purpose === 'enable_mfa' && settings?.emailOtpEnabled) {
      throw new ConflictException('Email MFA is already enabled.');
    }
    if (purpose === 'disable_mfa' && !settings?.emailOtpEnabled) {
      throw new ConflictException('Email MFA is not enabled.');
    }
    const challenge = await this.createOtp(user, purpose, metadata);
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() };
  }

  async getMfaStatus(userId: string): Promise<{ emailOtpEnabled: boolean }> {
    const settings = await this.mfaSettings.findOneBy({ userId });
    return { emailOtpEnabled: settings?.emailOtpEnabled ?? false };
  }

  async listSessions(userId: string): Promise<Array<{
    id: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date | null;
    userAgent: string | null;
  }>> {
    const sessions = await this.refreshTokens.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      select: { id: true, createdAt: true, expiresAt: true, lastUsedAt: true, userAgent: true },
      order: { createdAt: 'DESC' },
    });
    return sessions.map(({ id, createdAt, expiresAt, lastUsedAt, userAgent }) => ({
      id,
      createdAt,
      expiresAt,
      lastUsedAt: lastUsedAt ?? null,
      userAgent: userAgent ?? null,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.refreshTokens.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (result.affected !== 1) {
      throw new UnauthorizedException('Session not found.');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    const record = await this.findRefreshToken(refreshToken);
    if (!record) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    if (!record.revokedAt) {
      await this.refreshTokens.update(
        { id: record.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllSessions(userId);
  }

  async refresh(refreshToken: string, metadata: RequestMetadata): Promise<{
    user: PublicAuthUser;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }> {
    let payload: { sub?: unknown; type?: unknown };
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const record = await this.findRefreshToken(refreshToken);
    if (!record || record.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const nextRefreshToken = this.createRefreshToken(record.userId);
    const rotation = await this.dataSource.transaction(async (manager) => {
      const sessionRepository = manager.getRepository(RefreshToken);
      const current = await sessionRepository.findOne({
        where: { id: record.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        return { status: 'invalid' as const };
      }
      if (current.revokedAt) {
        return current.replacementTokenHash
          ? { status: 'reuse' as const }
          : { status: 'invalid' as const };
      }
      const now = new Date();
      if (current.expiresAt <= now || !record.user.emailVerifiedAt) {
        return { status: 'invalid' as const };
      }

      const result = await sessionRepository.update(
        { id: current.id, revokedAt: IsNull(), expiresAt: MoreThan(now) },
        {
          revokedAt: now,
          replacementTokenHash: this.hash(nextRefreshToken),
          lastUsedAt: now,
        },
      );
      if (result.affected !== 1) {
        return { status: 'reuse' as const };
      }

      const session = await sessionRepository.save(
        sessionRepository.create({
          userId: current.userId,
          tokenHash: this.hash(nextRefreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          ipHash: metadata.ip ? this.rateLimit.key('ip', metadata.ip) : null,
          userAgent: metadata.userAgent?.slice(0, 512) ?? null,
        }),
      );
      return { status: 'rotated' as const, sessionId: session.id };
    });
    if (rotation.status === 'reuse') {
      await this.revokeAllSessions(record.userId);
      await this.recordEvent('refresh_token_reuse_detected', record.userId, metadata.ip);
      throw new UnauthorizedException('Refresh token reuse detected. Please sign in again.');
    }
    if (rotation.status === 'invalid') {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
    return this.sessionResponse(record.user, nextRefreshToken, rotation.sessionId);
  }

  private async issueEmailVerification(user: User): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.emailVerificationTokens.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    await this.emailVerificationTokens.save(
      this.emailVerificationTokens.create({
        userId: user.id,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      }),
    );
    try {
      await this.emailDelivery.sendVerificationEmail(user.email, token);
    } catch (error) {
      await this.emailVerificationTokens.update(
        { tokenHash: this.hash(token), usedAt: IsNull() },
        { usedAt: new Date() },
      );
      throw error;
    }
  }

  private async createOtp(
    user: User,
    purpose: OtpPurpose,
    metadata: RequestMetadata,
  ): Promise<{ id: string; expiresAt: Date }> {
    await this.rateLimit.consume(
      this.rateLimit.key('otp:request', `${user.id}|${metadata.ip}`),
      5,
      300,
    );
    const recent = await this.otpVerifications.findOne({
      where: { userId: user.id, purpose, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AuthRateLimitException(
        Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000),
      );
    }
    await this.otpVerifications.update(
      { userId: user.id, purpose, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const challenge = await this.otpVerifications.save(
      this.otpVerifications.create({
        userId: user.id,
        purpose,
        codeHash: this.otpHash(code),
        expiresAt,
        attemptCount: 0,
      }),
    );
    try {
      await this.emailDelivery.sendOtpEmail(user.email, code, purpose);
    } catch (error) {
      await this.otpVerifications.update(
        { id: challenge.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      throw error;
    }
    return { id: challenge.id, expiresAt };
  }

  private async issueSession(
    user: User,
    metadata: RequestMetadata,
  ): Promise<{
    user: PublicAuthUser;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  }> {
    const refreshToken = this.createRefreshToken(user.id);
    const session = await this.persistRefreshToken(user.id, refreshToken, metadata);
    return this.sessionResponse(user, refreshToken, session.id);
  }

  private sessionResponse(user: User, refreshToken: string, sessionId: string) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        sid: sessionId,
        email: user.email,
        role: user.role,
        type: 'access',
        ver: user.authVersion ?? 0,
      },
      { expiresIn: '15m' },
    );
    return {
      user: this.toPublicUser(user),
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private createRefreshToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, type: 'refresh', jti: randomUUID() },
      { expiresIn: '7d' },
    );
  }

  private async persistRefreshToken(
    userId: string,
    token: string,
    metadata: RequestMetadata,
  ): Promise<RefreshToken> {
    return this.refreshTokens.save(
      this.refreshTokens.create({
        userId,
        tokenHash: this.hash(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ipHash: metadata.ip ? this.rateLimit.key('ip', metadata.ip) : null,
        userAgent: metadata.userAgent?.slice(0, 512) ?? null,
      }),
    );
  }

  private async findRefreshToken(token: string): Promise<RefreshToken | null> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
      return null;
    }
    return this.refreshTokens.findOne({
      where: { tokenHash: this.hash(token) },
      relations: { user: true },
    });
  }

  private async revokeAllSessions(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!manager) {
      await this.dataSource.transaction((transaction) =>
        this.revokeAllSessions(userId, transaction),
      );
      return;
    }

    const refreshTokens = manager.getRepository(RefreshToken);
    const users = manager.getRepository(User);
    await refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    await users.increment({ id: userId }, 'authVersion', 1);
  }

  private async recordEvent(
    event: string,
    userId?: string | null,
    ip?: string,
  ): Promise<void> {
    await this.securityEvents.save(
      this.securityEvents.create({
        event,
        userId: userId ?? null,
        ipHash: ip ? this.rateLimit.key('ip', ip) : null,
      }),
    );
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private validatePassword(password: string, fullName?: string, email?: string): void {
    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128 ||
      Buffer.byteLength(password, 'utf8') > 256 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password) ||
      (fullName && password.toLowerCase().includes(fullName.trim().toLowerCase())) ||
      (email && password.toLowerCase().includes(email.split('@')[0].toLowerCase()))
    ) {
      throw new BadRequestException(
        'Use 12–128 characters with uppercase and lowercase letters, a number, and a symbol; do not include your name or email.',
      );
    }
  }

  private otpHash(code: string): string {
    return createHmac('sha256', this.otpHmacSecret).update(code).digest('hex');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private toPublicUser(user: User): PublicAuthUser {
    return { id: user.id, name: user.fullName, email: user.email, role: user.role };
  }

  private isDuplicateEmail(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'driverError' in error &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }
}
