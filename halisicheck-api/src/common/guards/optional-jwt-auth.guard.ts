import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Attaches the user when a valid token is present, and allows the request
 * through when it is not.
 *
 * Jobs are usable anonymously so the service can be tried without signing up;
 * an authenticated caller gets their jobs associated with their account.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  override handleRequest<TUser>(_err: unknown, user: TUser): TUser | null {
    return user ?? null;
  }
}
