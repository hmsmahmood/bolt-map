import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  LoginRequest,
  LoginResult,
  OtpVerificationRequest,
  OtpVerificationResult,
  RegistrationRequest,
  RefreshRequest,
  RefreshResponse,
  AuthSession,
} from "../auth/auth.model";
import { ApiHealth } from "./api-health.model";
import {
  CommunityIncident,
  CommunityIncidentVote,
  CreateCommunityIncidentRequest,
  CreateCommunityIncidentResult,
} from "./community-incident.model";
import { NavigationRoute, NavigationRouteRequest } from "./navigation.model";
import { VehicleProfile, VehicleProfileWrite } from "./vehicle-profile.model";

export class ApiConfigurationError extends Error {
  constructor() {
    super("The API endpoint is not configured for this build.");
    this.name = "ApiConfigurationError";
  }
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, "");

  getHealth(): Observable<ApiHealth> {
    return this.http.get<ApiHealth>(this.endpoint("/health"));
  }

  login(credentials: LoginRequest): Observable<LoginResult> {
    return this.http.post<LoginResult>(
      this.endpoint("/auth/login"),
      credentials,
    );
  }

  register(request: RegistrationRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.endpoint("/auth/register"),
      request,
    );
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.post<void>(this.endpoint("/auth/verify-email"), { token });
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.endpoint("/auth/verify-email/resend"),
      { email },
    );
  }

  verifyOtp(
    request: OtpVerificationRequest,
  ): Observable<OtpVerificationResult> {
    return this.http.post<OtpVerificationResult>(
      this.endpoint("/auth/mfa/verify"),
      request,
    );
  }

  resendOtp(
    challengeId: string,
  ): Observable<{ challengeId: string; expiresAt: string }> {
    return this.http.post<{ challengeId: string; expiresAt: string }>(
      this.endpoint("/auth/mfa/resend"),
      { challengeId },
    );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      this.endpoint("/auth/password/forgot"),
      { email },
    );
  }

  resetPassword(request: {
    token: string;
    password: string;
    confirmPassword: string;
  }): Observable<void> {
    return this.http.post<void>(this.endpoint("/auth/password/reset"), request);
  }

  changePassword(request: {
    currentPassword: string;
    password: string;
    confirmPassword: string;
  }): Observable<void> {
    return this.http.post<void>(
      this.endpoint("/auth/password/change"),
      request,
    );
  }

  getMfaStatus(): Observable<{ emailOtpEnabled: boolean }> {
    return this.http.get<{ emailOtpEnabled: boolean }>(
      this.endpoint("/auth/mfa/status"),
    );
  }

  requestMfaChange(
    action: "enable" | "disable",
  ): Observable<{ challengeId: string; expiresAt: string }> {
    return this.http.post<{ challengeId: string; expiresAt: string }>(
      this.endpoint(`/auth/mfa/${action}/request`),
      {},
    );
  }

  getSessions(): Observable<AuthSession[]> {
    return this.http.get<AuthSession[]>(this.endpoint("/auth/sessions"));
  }

  revokeSession(id: string): Observable<void> {
    return this.http.delete<void>(
      this.endpoint(`/auth/sessions/${encodeURIComponent(id)}`),
    );
  }

  logoutAll(): Observable<void> {
    return this.http.post<void>(this.endpoint("/auth/logout-all"), {});
  }

  refresh(request: RefreshRequest): Observable<RefreshResponse> {
    return this.http.post<RefreshResponse>(
      this.endpoint("/auth/refresh"),
      request,
    );
  }

  logout(request: RefreshRequest): Observable<void> {
    return this.http.post<void>(this.endpoint("/auth/logout"), request);
  }

  getVehicleProfiles(): Observable<VehicleProfile[]> {
    return this.http.get<VehicleProfile[]>(
      this.endpoint("/v1/vehicle-profiles"),
    );
  }

  calculateNavigationRoute(
    request: NavigationRouteRequest,
  ): Observable<NavigationRoute> {
    return this.http.post<NavigationRoute>(
      this.endpoint("/navigation/route"),
      request,
    );
  }

  getNearbyCommunityIncidents(
    lat: number,
    lng: number,
    radiusMeters = 3000,
  ): Observable<CommunityIncident[]> {
    return this.http.post<CommunityIncident[]>(
      this.endpoint("/community/incidents/nearby"),
      { lat, lng, radiusMeters },
    );
  }

  createCommunityIncident(
    request: CreateCommunityIncidentRequest,
  ): Observable<CreateCommunityIncidentResult> {
    return this.http.post<CreateCommunityIncidentResult>(
      this.endpoint("/community/incidents"),
      request,
    );
  }

  voteOnCommunityIncident(
    incidentId: string,
    vote: CommunityIncidentVote,
  ): Observable<CommunityIncident> {
    return this.http.post<CommunityIncident>(
      this.endpoint(
        `/community/incidents/${encodeURIComponent(incidentId)}/votes`,
      ),
      { vote },
    );
  }

  deleteCommunityIncident(incidentId: string): Observable<void> {
    return this.http.delete<void>(
      this.endpoint(`/community/incidents/${encodeURIComponent(incidentId)}`),
    );
  }

  createVehicleProfile(
    profile: VehicleProfileWrite,
  ): Observable<VehicleProfile> {
    return this.http.post<VehicleProfile>(
      this.endpoint("/v1/vehicle-profiles"),
      profile,
    );
  }

  updateVehicleProfile(
    id: string,
    profile: Partial<VehicleProfileWrite>,
  ): Observable<VehicleProfile> {
    return this.http.patch<VehicleProfile>(
      this.endpoint(`/v1/vehicle-profiles/${encodeURIComponent(id)}`),
      profile,
    );
  }

  deleteVehicleProfile(id: string): Observable<void> {
    return this.http.delete<void>(
      this.endpoint(`/v1/vehicle-profiles/${encodeURIComponent(id)}`),
    );
  }

  private endpoint(path: string): string {
    if (!this.baseUrl) {
      throw new ApiConfigurationError();
    }

    return `${this.baseUrl}${path}`;
  }
}
