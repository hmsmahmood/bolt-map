import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import {
  AuthWorkflowService,
  RegistrationInput,
  RequestMetadata,
} from './auth-workflow.service';

export class RegistrationRequestDto implements RegistrationInput {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Matches(/^[0-9\s()-]{6,20}$/)
  mobileNumber: string;

  @IsString()
  @Matches(/^\+[1-9]\d{0,2}$/)
  countryCode: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  confirmPassword: string;

  @IsBoolean()
  @Equals(true)
  termsAccepted: boolean;
}

export class LoginRequestDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class EmailRequestDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class TokenRequestDto {
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  challengeId: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class OtpResendRequestDto {
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  challengeId: string;
}

export class PasswordResetRequestDto {
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  confirmPassword: string;
}

export class ChangePasswordRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  confirmPassword: string;
}

export class RefreshTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}

@Controller('api/auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly auth: AuthWorkflowService) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Register a new account and send email verification' })
  @ApiBody({ type: RegistrationRequestDto })
  async register(
    @Body() dto: RegistrationRequestDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.auth.register(dto, this.metadata(request));
    return {
      message: 'If an account can be created with these details, a verification email will be sent.',
    };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify an email address using its single-use link' })
  async verifyEmail(
    @Body() dto: TokenRequestDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.verifyEmail(dto.token, this.metadata(request));
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Resend an email verification link without disclosing account existence' })
  async resendVerification(
    @Body() dto: EmailRequestDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.auth.resendVerificationEmail(dto.email, this.metadata(request));
    return { message: 'If the account needs verification, a link will be sent.' };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password; may require an email OTP' })
  async login(
    @Body() dto: LoginRequestDto,
    @Req() request: Request,
  ) {
    return this.auth.login(dto.email, dto.password, this.metadata(request));
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a one-time email code for MFA or MFA enrollment' })
  async verifyOtp(
    @Body() dto: OtpRequestDto,
    @Req() request: Request,
  ) {
    return this.auth.verifyOtp(dto.challengeId, dto.code, this.metadata(request));
  }

  @Post('mfa/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend a login or MFA configuration code after the cooldown' })
  async resendOtp(
    @Body() dto: OtpResendRequestDto,
    @Req() request: Request,
  ) {
    return this.auth.resendOtp(dto.challengeId, this.metadata(request));
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(
    @Body() dto: EmailRequestDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.auth.requestPasswordReset(dto.email, this.metadata(request));
    return { message: 'If the account exists, a password reset link will be sent.' };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Use a single-use email link to set a new password' })
  async resetPassword(
    @Body() dto: PasswordResetRequestDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.resetPassword(
      dto.token,
      dto.password,
      dto.confirmPassword,
      this.metadata(request),
    );
  }

  @Post('password/change')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the authenticated user password and revoke sessions' })
  async changePassword(
    @Body() dto: ChangePasswordRequestDto,
    @Req() request: Request & { user: { id: string } },
  ): Promise<void> {
    await this.auth.changePassword(
      request.user.id,
      dto.currentPassword,
      dto.password,
      dto.confirmPassword,
      this.metadata(request),
    );
  }

  @Get('mfa/status')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Return current email MFA status' })
  getMfaStatus(@Req() request: Request & { user: { id: string } }) {
    return this.auth.getMfaStatus(request.user.id);
  }

  @Post('mfa/enable/request')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a one-time code to enable email MFA' })
  requestMfaEnable(@Req() request: Request & { user: { id: string } }) {
    return this.auth.requestMfaChange(
      request.user.id,
      'enable_mfa',
      this.metadata(request),
    );
  }

  @Post('mfa/disable/request')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a one-time code to disable email MFA' })
  requestMfaDisable(@Req() request: Request & { user: { id: string } }) {
    return this.auth.requestMfaChange(
      request.user.id,
      'disable_mfa',
      this.metadata(request),
    );
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List active sessions without exposing token material' })
  listSessions(@Req() request: Request & { user: { id: string } }) {
    return this.auth.listSessions(request.user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one of the authenticated user sessions' })
  async revokeSession(
    @Param('id') sessionId: string,
    @Req() request: Request & { user: { id: string } },
  ): Promise<void> {
    await this.auth.revokeSession(request.user.id, sessionId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the submitted refresh-token session' })
  async logout(@Body() dto: RefreshTokenRequestDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all sessions for the authenticated account' })
  async logoutAll(
    @Req() request: Request & { user: { id: string } },
  ): Promise<void> {
    await this.auth.logoutAll(request.user.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  refresh(
    @Body() dto: RefreshTokenRequestDto,
    @Req() request: Request,
  ) {
    return this.auth.refresh(dto.refreshToken, this.metadata(request));
  }

  private metadata(request: Request): RequestMetadata {
    return {
      ip: request.ip || 'unknown',
      userAgent: request.get('user-agent') ?? undefined,
    };
  }
}
