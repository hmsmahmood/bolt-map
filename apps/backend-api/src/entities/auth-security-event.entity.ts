import { CreateDateColumn, Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'auth_security_events' })
export class AuthSecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ type: 'text' })
  event: string;

  @Column({ name: 'ip_hash', type: 'text', nullable: true })
  ipHash?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
