import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  ValidatorFn,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { AuthSession, RegistrationRequest } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';

export type AuthFlowMode =
  | 'register'
  | 'verify-email'
  | 'otp'
  | 'forgot-password'
  | 'reset-password'
  | 'change-password'
  | 'security'
  | 'logout';

const strongPasswordValidators = [
  Validators.required,
  Validators.minLength(12),
  Validators.maxLength(128),
  Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/),
];

function textControl(validators: ValidatorFn[]): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

@Component({
  selector: 'gng-auth-flow',
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCheckbox,
    IonContent,
    IonInput,
    IonItem,
    IonLabel,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './auth-flow.page.html',
  styleUrl: './auth-flow.page.scss',
})
export class AuthFlowPage implements OnInit {
  readonly i18n = inject(TranslationService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly sessions = signal<AuthSession[]>([]);
  readonly emailMfaEnabled = signal(false);
  readonly mode = inject(ActivatedRoute).snapshot.data['mode'] as AuthFlowMode;

  readonly registrationForm = new FormGroup({
    fullName: textControl([
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(120),
    ]),
    email: textControl([
      Validators.required,
      Validators.email,
      Validators.maxLength(254),
    ]),
    countryCode: new FormControl('+60', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\+[1-9]\d{0,2}$/)],
    }),
    mobileNumber: textControl([
      Validators.required,
      Validators.pattern(/^[0-9\s()-]{6,20}$/),
    ]),
    password: textControl(strongPasswordValidators),
    confirmPassword: textControl([Validators.required]),
    termsAccepted: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });
  readonly emailForm = new FormGroup({
    email: textControl([
      Validators.required,
      Validators.email,
      Validators.maxLength(254),
    ]),
  });
  readonly otpForm = new FormGroup({
    code: textControl([
      Validators.required,
      Validators.pattern(/^\d{6}$/),
    ]),
  });
  readonly tokenForm = new FormGroup({
    token: textControl([Validators.required, Validators.minLength(32)]),
    password: textControl(strongPasswordValidators),
    confirmPassword: textControl([Validators.required]),
  });
  readonly changePasswordForm = new FormGroup({
    currentPassword: textControl([Validators.required]),
    password: textControl(strongPasswordValidators),
    confirmPassword: textControl([Validators.required]),
  });

  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.tokenForm.controls.token.setValue(token);
    }
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.emailForm.controls.email.setValue(email);
      if (this.mode === 'verify-email') {
        this.notice.set(this.i18n.text('verificationSent'));
      }
    }
    if (this.mode === 'security') {
      void this.loadSecuritySettings();
    }
  }

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.loading.set(true);

    try {
      switch (this.mode) {
        case 'register':
          await this.submitRegistration();
          break;
        case 'verify-email':
          this.tokenForm.controls.token.markAsTouched();
          if (this.tokenForm.controls.token.invalid) {
            this.error.set(this.i18n.text('validationError'));
            return;
          }
          await this.auth.verifyEmail(this.tokenForm.controls.token.value);
          this.notice.set(this.i18n.text('emailVerified'));
          break;
        case 'otp': {
          this.otpForm.markAllAsTouched();
          if (this.otpForm.invalid) {
            this.error.set(this.i18n.text('validationError'));
            return;
          }
          const result = await this.auth.verifyOtp(this.otpForm.controls.code.value);
          await this.router.navigateByUrl(
            result.mfaEnabled !== undefined ? '/security' : '/',
          );
          break;
        }
        case 'forgot-password':
          this.emailForm.markAllAsTouched();
          if (this.emailForm.invalid) {
            this.error.set(this.i18n.text('validationError'));
            return;
          }
          await this.auth.forgotPassword(this.emailForm.controls.email.value);
          this.notice.set(this.i18n.text('recoverySent'));
          break;
        case 'reset-password':
          this.tokenForm.markAllAsTouched();
          if (this.tokenForm.invalid) {
            this.error.set(this.i18n.text('validationError'));
            return;
          }
          if (this.tokenForm.controls.password.value !== this.tokenForm.controls.confirmPassword.value) {
            this.error.set(this.i18n.text('passwordsDoNotMatch'));
            return;
          }
          await this.auth.resetPassword(
            this.tokenForm.controls.token.value,
            this.tokenForm.controls.password.value,
            this.tokenForm.controls.confirmPassword.value,
          );
          this.notice.set(this.i18n.text('passwordResetComplete'));
          await this.router.navigateByUrl('/login');
          break;
        case 'change-password':
          this.changePasswordForm.markAllAsTouched();
          if (this.changePasswordForm.invalid) {
            this.error.set(this.i18n.text('validationError'));
            return;
          }
          if (this.changePasswordForm.controls.password.value !== this.changePasswordForm.controls.confirmPassword.value) {
            this.error.set(this.i18n.text('passwordsDoNotMatch'));
            return;
          }
          await this.auth.changePassword(
            this.changePasswordForm.controls.currentPassword.value,
            this.changePasswordForm.controls.password.value,
            this.changePasswordForm.controls.confirmPassword.value,
          );
          await this.router.navigateByUrl('/login');
          break;
        case 'logout':
          await this.auth.logout();
          await this.router.navigateByUrl('/');
          break;
      }
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async resendOtp(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.loading.set(true);
    try {
      await this.auth.resendOtp();
      this.notice.set(this.i18n.text('otpResent'));
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async resendVerificationEmail(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.emailForm.markAllAsTouched();
    if (this.emailForm.invalid) {
      this.error.set(this.i18n.text('validationError'));
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.resendVerification(this.emailForm.controls.email.value);
      this.notice.set(this.i18n.text('verificationSent'));
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async requestMfaChange(action: 'enable' | 'disable'): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.requestMfaChange(action);
      await this.router.navigateByUrl('/otp');
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async revokeSession(id: string): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.revokeSession(id);
      this.sessions.update((sessions) => sessions.filter((session) => session.id !== id));
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async logoutAll(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.logoutAll();
      await this.router.navigateByUrl('/login');
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  get title(): string {
    const titleByMode: Record<AuthFlowMode, string> = {
      register: this.i18n.text('registerTitle'),
      'verify-email': this.i18n.text('verifyEmailTitle'),
      otp: this.i18n.text('otpTitle'),
      'forgot-password': this.i18n.text('forgotPasswordTitle'),
      'reset-password': this.i18n.text('resetPasswordTitle'),
      'change-password': this.i18n.text('changePasswordTitle'),
      security: this.i18n.text('securityTitle'),
      logout: this.i18n.text('logoutConfirmTitle'),
    };
    return titleByMode[this.mode];
  }

  get submitLabel(): string {
    const labelByMode: Partial<Record<AuthFlowMode, string>> = {
      register: this.i18n.text('register'),
      'verify-email': this.i18n.text('verifyEmail'),
      otp: this.i18n.text('verifyCode'),
      'forgot-password': this.i18n.text('sendResetLink'),
      'reset-password': this.i18n.text('resetPassword'),
      'change-password': this.i18n.text('changePassword'),
      logout: this.i18n.text('confirmSignOut'),
    };
    return labelByMode[this.mode] ?? '';
  }

  private async submitRegistration(): Promise<void> {
    this.registrationForm.markAllAsTouched();
    if (this.registrationForm.invalid) {
      this.error.set(this.i18n.text('validationError'));
      return;
    }
    const value = this.registrationForm.getRawValue();
    if (value.password !== value.confirmPassword) {
      this.error.set(this.i18n.text('passwordsDoNotMatch'));
      return;
    }
    const request: RegistrationRequest = {
      fullName: value.fullName.trim(),
      email: value.email.trim().toLowerCase(),
      mobileNumber: value.mobileNumber,
      countryCode: value.countryCode,
      password: value.password,
      confirmPassword: value.confirmPassword,
      termsAccepted: true,
    };
    await this.auth.register(request);
    this.notice.set(this.i18n.text('verificationSent'));
    await this.router.navigateByUrl(
      `/verify-email?email=${encodeURIComponent(request.email)}`,
    );
  }

  private async loadSecuritySettings(): Promise<void> {
    this.loading.set(true);
    try {
      const [mfa, sessions] = await Promise.all([
        this.auth.getMfaStatus(),
        this.auth.getSessions(),
      ]);
      this.emailMfaEnabled.set(mfa.emailOtpEnabled);
      this.sessions.set(sessions);
    } catch (error: unknown) {
      this.error.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 429) {
        const retryAfter = error.headers.get('Retry-After');
        return retryAfter
          ? this.i18n.text('rateLimited').replace('{seconds}', retryAfter)
          : this.i18n.text('rateLimitedGeneric');
      }
      if (error.status === 0 || error.status >= 500) {
        return this.i18n.text('authServerError');
      }
      if (error.status === 401) {
        return this.i18n.text('authInvalid');
      }
    }
    return this.i18n.text('authActionFailed');
  }
}
