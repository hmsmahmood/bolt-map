import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'fleet_vehicles' })
export class FleetVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vehicle_code', type: 'text', unique: true })
  vehicleCode: string;

  @Column({ name: 'driver_name', type: 'text' })
  driverName: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'battery_level', type: 'int' })
  batteryLevel: number;

  @Column({ name: 'speed_kmh', type: 'int' })
  speedKmh: number;

  @Column({ name: 'last_position', type: 'geography', nullable: true })
  lastPosition?: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
