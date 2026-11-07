import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'routes' })
export class RouteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'text', unique: true })
  externalId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'driver_name', type: 'text' })
  driverName: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'text' })
  priority: string;

  @Column({ name: 'eta_minutes', type: 'int' })
  etaMinutes: number;

  @Column({ name: 'progress_percent', type: 'int' })
  progressPercent: number;

  @Column({ type: 'geography', nullable: true })
  origin?: unknown;

  @Column({ type: 'geography', nullable: true })
  destination?: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
