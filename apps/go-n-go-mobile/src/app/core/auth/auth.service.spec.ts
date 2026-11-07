import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../api/api.service';
import { AuthService } from './auth.service';
import { SecureSessionStore } from './secure-session-store.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpTestingController: HttpTestingController;
  const credentials = { email: 'driver@example.com', password: 'valid-test-password' };
  const user = {
    id: 'user-1',
    name: 'Test Driver',
    email: credentials.email,
    role: 'driver',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AuthService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('stores the refresh token in volatile web memory, not browser storage', async () => {
    const login = service.login(credentials);
    const request = httpTestingController.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await login;

    expect(service.user()).toEqual(user);
    expect(service.accessToken).toBe('access-token');
    expect(localStorage.getItem('auth-session')).toBeNull();
    await expectAsync(TestBed.inject(SecureSessionStore).load()).toBeResolvedTo({
      user,
      refreshToken: 'refresh-token',
    });
  });

  it('rotates and persists the refresh token before exposing the new access token', async () => {
    const login = service.login(credentials);
    httpTestingController.expectOne('/api/auth/login').flush({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await login;

    const refresh = service.refreshAccessToken();
    const request = httpTestingController.expectOne('/api/auth/refresh');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-token' });
    request.flush({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expectAsync(refresh).toBeResolvedTo('next-access-token');

    await expectAsync(TestBed.inject(SecureSessionStore).load()).toBeResolvedTo({
      user,
      refreshToken: 'next-refresh-token',
    });
    expect(service.accessToken).toBe('next-access-token');
  });

  it('restores a saved session by rotating its refresh token', async () => {
    await TestBed.inject(SecureSessionStore).save({
      user,
      refreshToken: 'saved-refresh-token',
    });

    const restore = service.restoreSession();
    await Promise.resolve();
    const request = httpTestingController.expectOne('/api/auth/refresh');
    expect(request.request.body).toEqual({ refreshToken: 'saved-refresh-token' });
    request.flush({
      accessToken: 'restored-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await restore;

    expect(service.user()).toEqual(user);
    expect(service.accessToken).toBe('restored-access-token');
    await expectAsync(TestBed.inject(SecureSessionStore).load()).toBeResolvedTo({
      user,
      refreshToken: 'rotated-refresh-token',
    });
  });

  it('clears local session data when the server rejects an expired refresh token', async () => {
    const login = service.login(credentials);
    httpTestingController.expectOne('/api/auth/login').flush({
      user,
      accessToken: 'access-token',
      refreshToken: 'expired-refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await login;

    const refresh = service.refreshAccessToken();
    httpTestingController.expectOne('/api/auth/refresh').flush(
      { message: 'Invalid or expired refresh token.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expectAsync(refresh).toBeRejected();

    expect(service.user()).toBeNull();
    expect(service.accessToken).toBeNull();
    expect(service.hasRefreshToken).toBeFalse();
    await expectAsync(TestBed.inject(SecureSessionStore).load()).toBeResolvedTo(null);
  });

  it('clears local session state after requesting server-side logout', async () => {
    const login = service.login(credentials);
    httpTestingController.expectOne('/api/auth/login').flush({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await login;

    const logout = service.logout();
    const request = httpTestingController.expectOne('/api/auth/logout');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-token' });
    request.flush(null);
    await logout;

    expect(service.user()).toBeNull();
    expect(service.accessToken).toBeNull();
    expect(service.hasRefreshToken).toBeFalse();
    await expectAsync(TestBed.inject(SecureSessionStore).load()).toBeResolvedTo(null);
  });

  it('waits for an in-flight refresh and revokes the rotated token on logout', async () => {
    const login = service.login(credentials);
    httpTestingController.expectOne('/api/auth/login').flush({
      user,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await login;

    const refresh = service.refreshAccessToken();
    const refreshRequest = httpTestingController.expectOne('/api/auth/refresh');
    const logout = service.logout();

    refreshRequest.flush({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await refresh;
    await Promise.resolve();
    await Promise.resolve();

    const logoutRequest = httpTestingController.expectOne('/api/auth/logout');
    expect(logoutRequest.request.body).toEqual({ refreshToken: 'next-refresh-token' });
    logoutRequest.flush(null);
    await logout;

    expect(service.user()).toBeNull();
    expect(service.accessToken).toBeNull();
  });
});
