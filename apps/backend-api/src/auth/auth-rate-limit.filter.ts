import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthRateLimitException } from './auth-rate-limit.service';

@Catch(AuthRateLimitException)
export class AuthRateLimitFilter implements ExceptionFilter<AuthRateLimitException> {
  catch(exception: AuthRateLimitException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    response.status(429).json(exception.getResponse());
  }
}
