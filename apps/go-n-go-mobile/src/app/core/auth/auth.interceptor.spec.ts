import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTestingController: HttpTestingController;
  const auth = {
    accessToken: 'access-token',
    hasRefreshToken: false,
    refreshAccessToken: jasmine.createSpy('refreshAccessToken'),
  };

  beforeEach(() => {
    auth.accessToken = 'access-token';
    auth.hasRefreshToken = false;
    auth.refreshAccessToken.calls.reset();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('adds the current bearer token to API requests', async () => {
    const response = firstValueFrom(http.get('/api/protected'));
    const request = httpTestingController.expectOne('/api/protected');

    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({ ok: true });
    await expectAsync(response).toBeResolvedTo({ ok: true });
  });

  it('does not attach bearer tokens to login requests', async () => {
    const response = firstValueFrom(http.post('/api/auth/login', {}));
    const request = httpTestingController.expectOne('/api/auth/login');

    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
    await expectAsync(response).toBeResolvedTo({});
  });

  it('refreshes once and retries a protected API request after a 401', fakeAsync(() => {
    auth.hasRefreshToken = true;
    auth.refreshAccessToken.and.returnValue(Promise.resolve('rotated-access-token'));
    let response: unknown;
    http.get('/api/protected').subscribe((value) => {
      response = value;
    });

    httpTestingController
      .expectOne('/api/protected')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks();

    const retry = httpTestingController.expectOne('/api/protected');
    expect(retry.request.headers.get('Authorization')).toBe(
      'Bearer rotated-access-token',
    );
    retry.flush({ ok: true });
    flushMicrotasks();

    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ ok: true });
  }));
});
