import { ArgumentsHost } from '@nestjs/common';
import {
  AuthRateLimitException,
} from './auth-rate-limit.service';
import { AuthRateLimitFilter } from './auth-rate-limit.filter';

describe('AuthRateLimitFilter', () => {
  it('returns HTTP 429 and a Retry-After header', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    new AuthRateLimitFilter().catch(new AuthRateLimitException(120), host);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      'Too many requests. Please try again later.',
    );
  });
});
