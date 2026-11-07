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
  readonly status = 'On-time arrival';

  readonly trip = {
    pickup: 'KL Sentral',
    dropoff: 'Mid Valley Megamall',
    eta: '12 min',
    fare: 'RM 18.40',
    driver: 'Aiman R.',
    rating: '4.9'
  };

  readonly checkpoints = [
    { label: 'Pickup', time: '08:12', active: true },
    { label: 'On route', time: '08:20', active: true },
    { label: 'Destination', time: '08:34', active: false }
  ];

  readonly safetyTips = [
    'Share trip with a trusted contact',
    'Your driver is verified and on route',
    'Emergency assistance is one tap away'
  ];
}
