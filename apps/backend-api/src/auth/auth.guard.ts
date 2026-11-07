import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('USER_REPOSITORY')
    private readonly userRepository: Repository<User>,
    @Inject('REFRESH_TOKEN_REPOSITORY')
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: Partial<User> }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.replace('Bearer ', '').trim();

    let payload: { sub?: unknown; sid?: unknown; type?: unknown; ver?: unknown } | null;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      payload.type === 'refresh' ||
      (payload.type !== undefined && payload.type !== 'access') ||
      (payload.type === 'access' && typeof payload.sid !== 'string')
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    let user: User | null;
    try {
      user = await this.userRepository.findOne({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          emailVerifiedAt: true,
          authVersion: true,
        },
      });
    } catch (error) {
      throw new ServiceUnavailableException('User authentication is unavailable', {
        cause: error,
      });
    }

    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (payload.ver !== undefined && payload.ver !== user.authVersion) {
      throw new UnauthorizedException('Session has been revoked.');
    }
    if (payload.type === 'access') {
      const sessionId = payload.sid;
      if (typeof sessionId !== 'string') {
        throw new UnauthorizedException('Invalid access token');
      }
      let session: RefreshToken | null;
      try {
        session = await this.refreshTokens.findOne({
          where: {
            id: sessionId,
            userId: user.id,
            revokedAt: IsNull(),
            expiresAt: MoreThan(new Date()),
          },
          select: { id: true },
        });
      } catch (error) {
        throw new ServiceUnavailableException('Session authentication is unavailable', {
          cause: error,
        });
      }
      if (!session) {
        throw new UnauthorizedException('Session has been revoked.');
      }
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    return true;
  }
}
