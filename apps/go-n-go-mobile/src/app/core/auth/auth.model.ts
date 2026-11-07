export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  mfaRequired?: false;
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface LoginMfaRequiredResponse {
  mfaRequired: true;
  challengeId: string;
  expiresAt: string;
}

export type LoginResult = LoginResponse | LoginMfaRequiredResponse;

export interface RegistrationRequest {
  fullName: string;
  email: string;
  mobileNumber: string;
  countryCode: string;
  password: string;
  confirmPassword: string;
  termsAccepted: true;
}

export interface OtpVerificationRequest {
  challengeId: string;
  code: string;
}

export interface OtpVerificationResult {
  mfaRequired?: false;
  mfaEnabled?: boolean;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface AuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface StoredSession {
  user: AuthUser;
  refreshToken: string;
}
