import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const authenticationEndpoint = /\/auth\/(login|refresh|logout)(?:[?#]|$)/;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const apiBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');
  const isApiRequest = apiBaseUrl.length > 0 && request.url.startsWith(`${apiBaseUrl}/`);

  const isAuthenticationRequest = authenticationEndpoint.test(request.url);
  if (!isApiRequest || isAuthenticationRequest || !auth.accessToken) {
    return next(request);
  }

  const authorizedRequest = request.clone({
    setHeaders: { Authorization: `Bearer ${auth.accessToken}` },
  });

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      if (!auth.hasRefreshToken || isAuthenticationRequest || !isUnauthorized(error)) {
        return throwError(() => error);
      }

      return from(auth.refreshAccessToken()).pipe(
        switchMap((accessToken) =>
          next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${accessToken}` },
            }),
          ),
        ),
      );
    }),
  );
};

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 401
  );
}
