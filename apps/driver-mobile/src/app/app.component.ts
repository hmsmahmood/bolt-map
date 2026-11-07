import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly status = 'On the road';

  readonly metrics = [
    { label: 'Trips today', value: '14', delta: '+3 vs yesterday' },
    { label: 'Earnings', value: 'RM 482', delta: '+RM 86 today' },
    { label: 'Safety score', value: '96%', delta: 'Good route compliance' }
  ];

  readonly routeStops = [
    { name: 'KL Sentral', eta: '08:15', status: 'Pickup ready' },
    { name: 'Mid Valley', eta: '08:42', status: 'Traffic normal' },
    { name: 'Bangsar', eta: '09:05', status: 'Drop-off next' }
  ];

  readonly alerts = [
    'Flood-prone stretch near Jalan Tun Razak',
    'Roadworks causing 6-minute delay near Puchong',
    'Low fuel warning: 22% remaining'
  ];
}
