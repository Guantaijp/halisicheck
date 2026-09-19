import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'reviewer@example.com' })
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'a-long-passphrase', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'Use at least 12 characters.' })
  @MaxLength(200)
  password: string;

  @ApiProperty({ required: false, example: 'A. Reviewer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'reviewer@example.com' })
  @IsEmail({}, { message: 'A valid email address is required.' })
  email: string;

  @ApiProperty({ example: 'a-long-passphrase' })
  @IsString()
  @MaxLength(200)
  password: string;
}
