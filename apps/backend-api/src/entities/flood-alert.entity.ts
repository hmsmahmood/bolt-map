import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'flood_alerts' })
export class FloodAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'text', unique: true })
  externalId: string;

  @Column({ type: 'text' })
  area: string;

  @Column({ type: 'text' })
  severity: string;

  @Column({ name: 'rainfall_mm_hr', type: 'numeric', precision: 5, scale: 2 })
  rainfallMmHr: number;

  @Column({ name: 'action_plan', type: 'text' })
  actionPlan: string;

  @Column({ type: 'geography', nullable: true })
  geom?: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
