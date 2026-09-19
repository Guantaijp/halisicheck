import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy.js';

/** Pulls the user Passport attached to the request. Null when anonymous. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | null => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user ?? null;
  },
);
