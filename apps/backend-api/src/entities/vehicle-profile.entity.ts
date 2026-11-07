import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum VehicleType {
  CAR = 'car',
  MOTORCYCLE = 'motorcycle',
  TRUCK = 'truck',
}

@Entity({ name: 'vehicle_profiles' })
@Check('"vehicle_type" IN (\'car\', \'motorcycle\', \'truck\')')
@Check('"model_year" IS NULL OR "model_year" BETWEEN 1900 AND 2100')
@Check('"max_weight_kg" IS NULL OR "max_weight_kg" BETWEEN 1 AND 100000')
@Check('"max_height_cm" IS NULL OR "max_height_cm" BETWEEN 1 AND 1000')
@Check('"max_length_cm" IS NULL OR "max_length_cm" BETWEEN 1 AND 3000')
export class VehicleProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'vehicle_type', type: 'text' })
  vehicleType: VehicleType;

  @Column({ type: 'text' })
  make: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ name: 'model_year', type: 'smallint', nullable: true })
  modelYear?: number | null;

  @Column({ name: 'registration_number', type: 'text', nullable: true })
  registrationNumber?: string | null;

  @Column({ name: 'max_weight_kg', type: 'integer', nullable: true })
  maxWeightKg?: number | null;

  @Column({ name: 'max_height_cm', type: 'integer', nullable: true })
  maxHeightCm?: number | null;

  @Column({ name: 'max_length_cm', type: 'integer', nullable: true })
  maxLengthCm?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
