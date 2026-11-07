import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  KeychainAccess,
  SecureStorage,
  SecureStoragePlugin,
} from '@aparajita/capacitor-secure-storage';
import { AuthUser, StoredSession } from './auth.model';

const SESSION_KEY = 'auth-session';
const STORAGE_PREFIX = 'com.smartroute.gonngo.auth';
type SecureStorageAdapter = Pick<
  SecureStoragePlugin,
  'get' | 'remove' | 'set' | 'setDefaultKeychainAccess' | 'setKeyPrefix'
>;

const SECURE_STORAGE_ADAPTER = new InjectionToken<SecureStorageAdapter>(
  'SecureStorageAdapter',
  {
    providedIn: 'root',
    factory: () =>
      Capacitor.isNativePlatform() ? SecureStorage : webSecureStorageAdapter,
  },
);

const nativeStorageUnavailable = async () => {
  throw new Error('Native secure storage is unavailable on web.');
};

const webSecureStorageAdapter: SecureStorageAdapter = {
  get: nativeStorageUnavailable,
  remove: nativeStorageUnavailable,
  set: nativeStorageUnavailable,
  setDefaultKeychainAccess: nativeStorageUnavailable,
  setKeyPrefix: nativeStorageUnavailable,
};

@Injectable({ providedIn: 'root' })
export class SecureSessionStore {
  private volatileSession: StoredSession | null = null;
  private readonly native = Capacitor.isNativePlatform();

  constructor(
    @Inject(SECURE_STORAGE_ADAPTER)
    private readonly secureStorage: SecureStorageAdapter = SecureStorage,
  ) {}

  async load(): Promise<StoredSession | null> {
    if (!this.native) {
      return this.volatileSession;
    }

    await this.setNativePrefix();
    const stored = await this.secureStorage.get(SESSION_KEY);
    if (stored === null) {
      return null;
    }
    if (typeof stored !== 'string') {
      throw new Error('Stored authentication session has an invalid format.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      throw new Error('Stored authentication session could not be decoded.', {
        cause: error,
      });
    }

    if (!this.isStoredSession(parsed)) {
      throw new Error('Stored authentication session has an invalid format.');
    }

    return parsed;
  }

  async save(session: StoredSession): Promise<void> {
    if (!this.native) {
      this.volatileSession = session;
      return;
    }

    await this.setNativePrefix();
    await this.secureStorage.set(SESSION_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    if (!this.native) {
      this.volatileSession = null;
      return;
    }

    await this.setNativePrefix();
    await this.secureStorage.remove(SESSION_KEY);
  }

  private async setNativePrefix(): Promise<void> {
    await this.secureStorage.setKeyPrefix(STORAGE_PREFIX);
    await this.secureStorage.setDefaultKeychainAccess(
      KeychainAccess.whenUnlockedThisDeviceOnly,
    );
  }

  private isStoredSession(value: unknown): value is StoredSession {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    const session = value as { refreshToken?: unknown; user?: unknown };
    if (typeof session.refreshToken !== 'string' || !session.refreshToken) {
      return false;
    }
    if (typeof session.user !== 'object' || session.user === null || Array.isArray(session.user)) {
      return false;
    }

    const user = session.user as Partial<AuthUser>;
    return (
      typeof user.id === 'string' &&
      typeof user.name === 'string' &&
      typeof user.email === 'string' &&
      typeof user.role === 'string'
    );
  }
}
