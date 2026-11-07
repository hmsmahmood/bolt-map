import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface DashboardSummary {
  overview: {
    activeTrips: number;
    liveAlerts: number;
    safeMiles: number;
    deliveryEfficiency: number;
  };
  routes: Array<{
    id: string;
    title: string;
    driver: string;
    status: string;
    eta: string;
    progress: number;
    priority: string;
  }>;
  incidents: Array<{
    id: string;
    type: string;
    severity: string;
    location: string;
    status: string;
    eta: string;
  }>;
  fleet: Array<{
    id: string;
    driver: string;
    status: string;
    battery: number;
    speed: number;
  }>;
  alertFeed: string[];
  floodAlerts?: Array<{
    id: string;
    area: string;
    level: string;
    rainfall: string;
    action: string;
  }>;
  safetySignals?: Array<{
    zone: string;
    risk: string;
    score: number;
  }>;
  adminScores?: {
    compliance: number;
    coverage: number;
    uptime: number;
    response: number;
  };
}

interface LoginResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  token: string;
  expiresAt: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'SMARTROUTE AI';
  dashboard: DashboardSummary | null = null;
  loading = true;
  error = '';
  isAuthenticated = false;
  activeTab = 'overview';
  loginForm = {
    email: 'ops@smartroute.ai',
    password: 'SmartRoute2025!',
  };
  sessionUser = '';
  loginStatus = '';

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  login(): void {
    this.loginStatus = 'Signing in...';
    this.http
      .post<LoginResponse>('http://localhost:3000/api/auth/login', this.loginForm)
      .subscribe({
        next: (response) => {
          this.isAuthenticated = true;
          this.sessionUser = response.user.name;
          this.loginStatus = `Signed in as ${response.user.name}`;
          this.loadDashboard();
        },
        error: () => {
          this.loginStatus = 'Authentication failed. Please use the demo credentials.';
        },
      });
  }

  private loadDashboard(): void {
    this.loading = true;
    this.http
      .get<DashboardSummary>('http://localhost:3000/api/dashboard/summary')
      .subscribe({
        next: (response) => {
          this.dashboard = response;
          this.loading = false;
          this.error = '';
        },
        error: () => {
          this.error = 'Unable to reach the SMARTROUTE API on localhost:3000';
          this.loading = false;
        },
      });
  }
}
