import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'incidents' })
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'text', unique: true })
  externalId: string;

  @Column({ name: 'incident_type', type: 'text' })
  incidentType: string;

  @Column({ type: 'text' })
  severity: string;

  @Column({ type: 'text' })
  location: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'eta_minutes', type: 'int' })
  etaMinutes: number;

  @Column({ type: 'geography', nullable: true })
  geom?: unknown;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
