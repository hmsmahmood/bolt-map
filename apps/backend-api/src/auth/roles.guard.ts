import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: { role?: string } }>();
    const userRole = request.user?.role?.trim();

    if (!userRole) {
      throw new UnauthorizedException('Missing user role context');
    }

    const normalizedUserRole = userRole.toLowerCase();
    const hasRequiredRole = requiredRoles.some(
      (role) => role.trim().toLowerCase() === normalizedUserRole,
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
