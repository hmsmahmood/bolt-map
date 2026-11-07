import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let page: LoginPage;
  let router: Router;
  const auth = {
    login: jasmine.createSpy('login').and.resolveTo(),
    pendingChallenge: jasmine.createSpy('pendingChallenge').and.returnValue(null),
  };

  beforeEach(() => {
    auth.login.calls.reset();
    auth.pendingChallenge.calls.reset();
    auth.pendingChallenge.and.returnValue(null);
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: TranslationService,
          useValue: { text: (key: string) => key },
        },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    page = TestBed.createComponent(LoginPage).componentInstance;
  });

  it('marks invalid fields and does not send incomplete credentials', async () => {
    await page.submit();

    expect(page.form.controls.email.touched).toBeTrue();
    expect(page.form.controls.password.touched).toBeTrue();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials and routes an MFA challenge to OTP', async () => {
    page.form.setValue({ email: 'rider@example.com', password: 'valid-password' });
    auth.pendingChallenge.and.returnValue({
      mfaRequired: true,
      challengeId: 'challenge-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await page.submit();

    expect(auth.login).toHaveBeenCalledWith({
      email: 'rider@example.com',
      password: 'valid-password',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/otp');
  });

  it('prevents duplicate login submissions while a request is pending', async () => {
    page.form.setValue({ email: 'rider@example.com', password: 'valid-password' });
    let finishRequest!: () => void;
    auth.login.and.returnValue(
      new Promise<void>((resolve) => {
        finishRequest = resolve;
      }),
    );

    const firstSubmission = page.submit();
    await page.submit();
    expect(auth.login).toHaveBeenCalledTimes(1);

    finishRequest();
    await firstSubmission;
  });
});
