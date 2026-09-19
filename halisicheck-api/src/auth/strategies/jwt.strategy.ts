import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration.js';
import { UsersService } from '../../users/users.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<AppConfig['auth']>('auth').jwtSecret,
    });
  }

  /**
   * Re-reads the user on every request so a deactivated account loses access
   * immediately, rather than when its token happens to expire.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findById(payload.sub).catch(() => null);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or deactivated.');
    }
    return { id: user.id, email: user.email };
  }
}
