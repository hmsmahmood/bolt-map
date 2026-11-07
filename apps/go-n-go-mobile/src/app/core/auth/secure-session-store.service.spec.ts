import { Capacitor } from '@capacitor/core';
import { KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { SecureSessionStore } from './secure-session-store.service';

describe('SecureSessionStore', () => {
  let store: SecureSessionStore;
  let nativePlatform: jasmine.Spy;

  beforeEach(() => {
    nativePlatform = spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
  });

  it('keeps web sessions in memory without writing tokens to localStorage', async () => {
    store = new SecureSessionStore();
    const session = {
      user: {
        id: 'user-1',
        name: 'Test Driver',
        email: 'driver@example.com',
        role: 'driver',
      },
      refreshToken: 'refresh-token',
    };

    await store.save(session);

    expect(localStorage.getItem('auth-session')).toBeNull();
    await expectAsync(store.load()).toBeResolvedTo(session);

    await store.clear();
    await expectAsync(store.load()).toBeResolvedTo(null);
  });

  it('uses the native secure-storage plugin and device-only Keychain accessibility', async () => {
    nativePlatform.and.returnValue(true);
    expect(Capacitor.isNativePlatform()).toBeTrue();
    const session = {
      user: {
        id: 'user-1',
        name: 'Test Driver',
        email: 'driver@example.com',
        role: 'driver',
      },
      refreshToken: 'refresh-token',
    };
    let persistedValue: string | null = null;
    const secureStorage = jasmine.createSpyObj('SecureStorage', [
      'setKeyPrefix',
      'setDefaultKeychainAccess',
      'set',
      'get',
      'remove',
    ]);
    secureStorage.setKeyPrefix.and.resolveTo();
    secureStorage.setDefaultKeychainAccess.and.resolveTo();
    secureStorage.set.and.callFake(async (_key: string, value: string) => {
      persistedValue = value;
    });
    secureStorage.get.and.callFake(async () => persistedValue);
    secureStorage.remove.and.callFake(async () => {
      persistedValue = null;
      return true;
    });

    store = new SecureSessionStore(secureStorage);
    await store.save(session);
    await expectAsync(store.load()).toBeResolvedTo(session);
    await store.clear();

    expect(secureStorage.setKeyPrefix).toHaveBeenCalledWith(
      'com.smartroute.gonngo.auth',
    );
    expect(secureStorage.setDefaultKeychainAccess).toHaveBeenCalledWith(
      KeychainAccess.whenUnlockedThisDeviceOnly,
    );
    expect(secureStorage.remove).toHaveBeenCalledWith('auth-session');
    expect(persistedValue).toBeNull();
  });

  it('propagates native secure-storage failures instead of falling back to web storage', async () => {
    nativePlatform.and.returnValue(true);
    expect(Capacitor.isNativePlatform()).toBeTrue();
    const secureStorage = jasmine.createSpyObj('SecureStorage', [
      'setKeyPrefix',
      'setDefaultKeychainAccess',
      'get',
      'set',
      'remove',
    ]);
    secureStorage.setKeyPrefix.and.rejectWith(
      new Error('secure storage unavailable'),
    );
    store = new SecureSessionStore(secureStorage);

    await expectAsync(store.load()).toBeRejectedWithError(
      'secure storage unavailable',
    );
    expect(localStorage.getItem('auth-session')).toBeNull();
  });
});
