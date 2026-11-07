import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const request = {
    headers: { authorization: 'Bearer access-token' },
    user: undefined as unknown,
  };
  const jwt = { verify: jest.fn() };
  const userRepository = { findOne: jest.fn() };
  const refreshTokens = { findOne: jest.fn() };
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    request.user = undefined;
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      userRepository as unknown as Repository<User>,
      refreshTokens as unknown as Repository<RefreshToken>,
    );
    jwt.verify.mockReturnValue({
      sub: 'user-1',
      sid: 'session-1',
      type: 'access',
      ver: 2,
    });
    userRepository.findOne.mockResolvedValue({
      id: 'user-1',
      email: 'rider@example.com',
      role: 'rider',
      fullName: 'Sample Rider',
      emailVerifiedAt: new Date(),
      authVersion: 2,
    });
    refreshTokens.findOne.mockResolvedValue({ id: 'session-1' });
  });

  function executionContext(): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  it('accepts verified access tokens and attaches the current user', async () => {
    await expect(guard.canActivate(executionContext())).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'rider@example.com',
      role: 'rider',
      fullName: 'Sample Rider',
    });
  });

  it('rejects unverified accounts', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'rider@example.com',
      role: 'rider',
      fullName: 'Sample Rider',
      emailVerifiedAt: null,
      authVersion: 2,
    });

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens from a revoked auth version', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      id: 'user-1',
      email: 'rider@example.com',
      role: 'rider',
      fullName: 'Sample Rider',
      emailVerifiedAt: new Date(),
      authVersion: 3,
    });

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens whose session has been revoked', async () => {
    refreshTokens.findOne.mockResolvedValueOnce(null);

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshTokens.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'session-1', userId: 'user-1' }),
      }),
    );
  });

  it('rejects typed access tokens without a session id', async () => {
    jwt.verify.mockReturnValueOnce({
      sub: 'user-1',
      type: 'access',
      ver: 2,
    });

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});
