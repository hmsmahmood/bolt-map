import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { AuthFlowPage } from './auth-flow.page';

describe('AuthFlowPage', () => {
  let page: AuthFlowPage;
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;
  let routeData: Record<string, string>;

  beforeEach(() => {
    routeData = { mode: 'register' };
    auth = jasmine.createSpyObj<AuthService>('AuthService', [
      'register',
      'resendVerification',
    ]);

    TestBed.configureTestingModule({
      imports: [AuthFlowPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: routeData,
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: TranslationService,
          useValue: { text: (key: string) => key },
        },
      ],
    });

    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    page = TestBed.createComponent(AuthFlowPage).componentInstance;
  });

  it('shows a validation error and does not submit incomplete registration', async () => {
    await page.submit();

    expect(page.error()).toBe('validationError');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('submits a valid registration and continues to email verification', async () => {
    page.registrationForm.setValue({
      fullName: 'Sample Rider',
      email: 'rider@example.com',
      countryCode: '+60',
      mobileNumber: '0123456789',
      password: 'StrongPass!234',
      confirmPassword: 'StrongPass!234',
      termsAccepted: true,
    });
    auth.register.and.resolveTo();

    await page.submit();

    expect(auth.register).toHaveBeenCalledWith(
      jasmine.objectContaining({
        email: 'rider@example.com',
        termsAccepted: true,
      }),
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/verify-email?email=rider%40example.com',
    );
  });

  it('prevents duplicate registration submissions while a request is pending', async () => {
    page.registrationForm.setValue({
      fullName: 'Sample Rider',
      email: 'rider@example.com',
      countryCode: '+60',
      mobileNumber: '0123456789',
      password: 'StrongPass!234',
      confirmPassword: 'StrongPass!234',
      termsAccepted: true,
    });
    let finishRequest!: () => void;
    auth.register.and.returnValue(
      new Promise<void>((resolve) => {
        finishRequest = resolve;
      }),
    );

    const firstSubmission = page.submit();
    await page.submit();
    expect(auth.register).toHaveBeenCalledTimes(1);

    finishRequest();
    await firstSubmission;
  });

  it('resends verification to the entered email without requiring a token', async () => {
    routeData['mode'] = 'verify-email';
    // The page mode is set from the route snapshot when its component is created.
    const emailPage = TestBed.createComponent(AuthFlowPage).componentInstance;
    emailPage.emailForm.controls.email.setValue('rider@example.com');
    auth.resendVerification.and.resolveTo();

    await emailPage.resendVerificationEmail();

    expect(auth.resendVerification).toHaveBeenCalledWith('rider@example.com');
    expect(emailPage.notice()).toBe('verificationSent');
  });
});
