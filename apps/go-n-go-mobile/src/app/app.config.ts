import { provideHttpClient, withInterceptors } from "@angular/common/http";
import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideIonicAngular } from "@ionic/angular/standalone";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth/auth.interceptor";
import { AuthService } from "./core/auth/auth.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideIonicAngular(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () =>
        auth.restoreSession().catch(() => {
          console.error("Could not restore the saved authentication session.");
        }),
      deps: [AuthService],
      multi: true,
    },
  ],
};
