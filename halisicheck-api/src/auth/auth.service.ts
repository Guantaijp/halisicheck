import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfig } from '../config/configuration.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
  user: { id: string; email: string; displayName: string | null };
}

@Injectable()
export class AuthService {
  private readonly cfg: AppConfig['auth'];

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<AppConfig['auth']>('auth');
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const user = await this.users.create(dto.email, dto.password, dto.displayName);
    return this.issue(user.id, user.email, user.displayName);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findForLogin(dto.email);

    // One message for both "no such user" and "wrong password", so the
    // endpoint cannot be used to enumerate registered addresses.
    const invalid = new UnauthorizedException('Email or password is incorrect.');
    if (!user) throw invalid;

    const ok = await this.users.verifyPassword(dto.password, user.passwordHash);
    if (!ok) throw invalid;
    if (!user.isActive) throw new UnauthorizedException('This account is deactivated.');

    return this.issue(user.id, user.email, user.displayName);
  }

  private issue(id: string, email: string, displayName: string | null): AuthTokens {
    return {
      accessToken: this.jwt.sign({ sub: id, email }),
      expiresIn: this.cfg.jwtExpiresIn,
      user: { id, email, displayName },
    };
  }
}
