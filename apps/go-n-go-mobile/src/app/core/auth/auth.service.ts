import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import {
  AuthUser,
  AuthSession,
  LoginMfaRequiredResponse,
  LoginRequest,
  LoginResponse,
  LoginResult,
  OtpVerificationResult,
  RegistrationRequest,
  RefreshResponse,
} from './auth.model';
import { SecureSessionStore } from './secure-session-store.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly sessionStore = inject(SecureSessionStore);
  private readonly currentUser = signal<AuthUser | null>(null);
  private readonly currentAccessToken = signal<string | null>(null);
  private readonly restoreFailed = signal(false);
  private readonly challenge = signal<LoginMfaRequiredResponse | null>(null);
  private refreshToken: string | null = null;
  private restoreUser: AuthUser | null = null;
  private refreshInFlight: Promise<string> | null = null;
  private loggingOut = false;

  readonly user = this.currentUser.asReadonly();
  readonly sessionRestoreFailed = this.restoreFailed.asReadonly();
  readonly pendingChallenge = this.challenge.asReadonly();

  get accessToken(): string | null {
    return this.currentAccessToken();
  }

  get hasRefreshToken(): boolean {
    return this.refreshToken !== null;
  }

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(this.api.login(credentials));
    if (response?.mfaRequired === true) {
      if (!response.challengeId || !response.expiresAt) {
        throw new Error('The authentication server returned an invalid MFA challenge.');
      }
      this.challenge.set(response);
      return;
    }

    this.validateLoginResponse(response);
    await this.completeLogin(response);
  }

  async register(request: RegistrationRequest): Promise<void> {
    await firstValueFrom(this.api.register(request));
  }

  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(this.api.verifyEmail(token));
  }

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(this.api.resendVerification(email));
  }

  async verifyOtp(code: string): Promise<OtpVerificationResult> {
    const challenge = this.challenge();
    if (!challenge) {
      throw new Error('There is no active authentication challenge.');
    }
    const result = await firstValueFrom(
      this.api.verifyOtp({ challengeId: challenge.challengeId, code }),
    );
    if (
      result.accessToken &&
      result.refreshToken &&
      this.isAuthUser(result.user)
    ) {
      await this.completeLogin({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        expiresAt: result.expiresAt ?? '',
      });
    } else {
      this.challenge.set(null);
    }
    return result;
  }

  async resendOtp(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge) {
      throw new Error('There is no active authentication challenge.');
    }
    const result = await firstValueFrom(
      this.api.resendOtp(challenge.challengeId),
    );
    this.challenge.set({
      mfaRequired: true,
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.api.forgotPassword(email));
  }

  async resetPassword(token: string, password: string, confirmPassword: string): Promise<void> {
    await firstValueFrom(
      this.api.resetPassword({ token, password, confirmPassword }),
    );
  }

  async changePassword(
    currentPassword: string,
    password: string,
    confirmPassword: string,
  ): Promise<void> {
    await firstValueFrom(
      this.api.changePassword({ currentPassword, password, confirmPassword }),
    );
    await this.clearLocalSession();
  }

  async getMfaStatus(): Promise<{ emailOtpEnabled: boolean }> {
    return firstValueFrom(this.api.getMfaStatus());
  }

  async requestMfaChange(action: 'enable' | 'disable'): Promise<{ challengeId: string; expiresAt: string }> {
    const result = await firstValueFrom(this.api.requestMfaChange(action));
    this.challenge.set({ mfaRequired: true, ...result });
    return result;
  }

  async getSessions(): Promise<AuthSession[]> {
    return firstValueFrom(this.api.getSessions());
  }

  async revokeSession(id: string): Promise<void> {
    await firstValueFrom(this.api.revokeSession(id));
  }

  async logoutAll(): Promise<void> {
    try {
      await firstValueFrom(this.api.logoutAll());
    } finally {
      await this.clearLocalSession();
    }
  }

  async restoreSession(): Promise<void> {
    try {
      const stored = await this.sessionStore.load();
      if (!stored) {
        return;
      }

      this.refreshToken = stored.refreshToken;
      this.restoreUser = stored.user;
      await this.refreshAccessToken();
    } catch (error) {
      this.restoreFailed.set(true);
      throw error;
    }
  }

  async refreshAccessToken(): Promise<string> {
    if (this.loggingOut) {
      throw new Error('The session is being cleared.');
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.rotateRefreshToken()
      .catch(async (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          await this.clearLocalSession();
        }
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    this.loggingOut = true;
    const pendingRefresh = this.refreshInFlight;
    const refreshOutcome = pendingRefresh
      ? (await Promise.allSettled([pendingRefresh]))[0]
      : null;
    const refreshToken = this.refreshToken;

    try {
      if (refreshToken) {
        await firstValueFrom(this.api.logout({ refreshToken }));
      } else if (
        refreshOutcome?.status === 'rejected' &&
        this.currentUser() !== null
      ) {
        throw refreshOutcome.reason;
      }
    } finally {
      try {
        await this.clearLocalSession();
      } finally {
        this.loggingOut = false;
      }
    }
  }

  private async rotateRefreshToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token is available for this session.');
    }

    const response = await firstValueFrom(
      this.api.refresh({ refreshToken: this.refreshToken }),
    );
    this.validateRefreshResponse(response);

    const user = this.currentUser() ?? this.restoreUser;
    if (!user) {
      throw new Error('The saved session has no user profile.');
    }

    await this.sessionStore.save({
      user,
      refreshToken: response.refreshToken,
    });

    this.refreshToken = response.refreshToken;
    this.restoreUser = user;
    this.currentUser.set(user);
    this.currentAccessToken.set(response.accessToken);

    return response.accessToken;
  }

  private async clearLocalSession(): Promise<void> {
    this.currentUser.set(null);
    this.currentAccessToken.set(null);
    this.refreshToken = null;
    this.restoreUser = null;
    await this.sessionStore.clear();
  }

  private async completeLogin(response: LoginResponse): Promise<void> {
    const session = {
      user: response.user,
      refreshToken: response.refreshToken,
    };
    await this.sessionStore.save(session);

    this.refreshToken = response.refreshToken;
    this.restoreUser = response.user;
    this.currentUser.set(response.user);
    this.currentAccessToken.set(response.accessToken);
    this.challenge.set(null);
  }

  private validateLoginResponse(response: LoginResult): asserts response is LoginResponse {
    if (
      !response ||
      response.mfaRequired === true ||
      typeof response.accessToken !== 'string' ||
      !response.accessToken ||
      typeof response.refreshToken !== 'string' ||
      !response.refreshToken ||
      !this.isAuthUser(response.user)
    ) {
      throw new Error('The authentication server returned an invalid session.');
    }
  }

  private validateRefreshResponse(response: RefreshResponse): void {
    if (
      !response ||
      typeof response.accessToken !== 'string' ||
      !response.accessToken ||
      typeof response.refreshToken !== 'string' ||
      !response.refreshToken
    ) {
      throw new Error('The authentication server returned an invalid refreshed session.');
    }
  }

  private isAuthUser(user: unknown): user is AuthUser {
    if (typeof user !== 'object' || user === null || Array.isArray(user)) {
      return false;
    }

    const candidate = user as Partial<AuthUser>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      typeof candidate.email === 'string' &&
      typeof candidate.role === 'string'
    );
  }
}
