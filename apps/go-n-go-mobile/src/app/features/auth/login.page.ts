import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';
import { ApiConfigurationError } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';

type LoginError = 'invalid' | 'network' | 'server';

@Component({
  selector: 'gng-login',
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonInput,
    IonItem,
    IonLabel,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  readonly i18n = inject(TranslationService);
  readonly loading = signal(false);
  readonly error = signal<LoginError | null>(null);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.login({
        email: this.form.controls.email.value.trim().toLowerCase(),
        password: this.form.controls.password.value,
      });
      await this.router.navigateByUrl(
        this.auth.pendingChallenge() ? '/otp' : '/',
      );
    } catch (error: unknown) {
      if (error instanceof ApiConfigurationError) {
        this.error.set('server');
      } else if (error instanceof HttpErrorResponse && error.status === 401) {
        this.error.set('invalid');
      } else if (
        error instanceof HttpErrorResponse &&
        (error.status === 0 || error.status >= 500)
      ) {
        this.error.set('network');
      } else {
        this.error.set('server');
        console.error('Authentication request failed.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  get errorMessage(): string {
    const error = this.error();
    if (!error) {
      return '';
    }

    const keyByError: Record<LoginError, 'authInvalid' | 'authNetwork' | 'authServerError'> = {
      invalid: 'authInvalid',
      network: 'authNetwork',
      server: 'authServerError',
    };

    return this.i18n.text(keyByError[error]);
  }
}
