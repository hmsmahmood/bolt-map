import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { ApiConfigurationError, ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';

type ConnectionState = 'unknown' | 'checking' | 'online' | 'offline' | 'unconfigured';

@Component({
  selector: 'gng-home',
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonSelect,
    IonSelectOption,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  readonly i18n = inject(TranslationService);
  readonly auth = inject(AuthService);
  readonly connectionState = signal<ConnectionState>('unknown');
  readonly connectionDetail = signal('');
  readonly logoutFailed = signal(false);

  private readonly api = inject(ApiService);

  ngOnInit(): void {
    void this.checkConnection();
  }

  async logout(): Promise<void> {
    this.logoutFailed.set(false);
    try {
      await this.auth.logout();
    } catch {
      this.logoutFailed.set(true);
    }
  }

  async checkConnection(): Promise<void> {
    this.connectionState.set('checking');
    this.connectionDetail.set('');

    try {
      const health = await firstValueFrom(this.api.getHealth());
      if (health?.status !== 'ok') {
        this.connectionState.set('offline');
        this.connectionDetail.set('The API returned an unexpected health status.');
        return;
      }

      this.connectionState.set('online');
      this.connectionDetail.set(`${health.service} · ${health.environment}`);
    } catch (error: unknown) {
      if (error instanceof ApiConfigurationError) {
        this.connectionState.set('unconfigured');
      } else {
        this.connectionState.set('offline');
        this.connectionDetail.set(
          error instanceof HttpErrorResponse && error.status
            ? `HTTP ${error.status}`
            : 'Network request failed',
        );
      }
    }
  }

  setLocale(event: CustomEvent<{ value: string }>): void {
    this.i18n.setLocale(event.detail.value);
  }

  get connectionMessage(): string {
    const keyByState: Record<
      ConnectionState,
      | 'connectionUnknown'
      | 'connectionChecking'
      | 'connectionOnline'
      | 'connectionOffline'
      | 'connectionNotConfigured'
    > = {
      unknown: 'connectionUnknown',
      checking: 'connectionChecking',
      online: 'connectionOnline',
      offline: 'connectionOffline',
      unconfigured: 'connectionNotConfigured',
    };

    return this.i18n.text(keyByState[this.connectionState()]);
  }
}
