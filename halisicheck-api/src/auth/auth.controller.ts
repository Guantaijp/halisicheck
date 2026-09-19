import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService, type AuthTokens } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and return an access token' })
  @ApiResponse({ status: 201, description: 'Account created.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  async register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access token' })
  @ApiResponse({ status: 401, description: 'Email or password is incorrect.' })
  async login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
