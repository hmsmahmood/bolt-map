import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserSubscription } from './user-subscription.entity';

@Entity({ name: 'subscription_transaction_references' })
@Check('"provider" = LOWER(BTRIM("provider"))')
@Check('LENGTH("provider") BETWEEN 1 AND 64')
@Check('"transaction_reference" = BTRIM("transaction_reference")')
@Check('LENGTH("transaction_reference") BETWEEN 1 AND 512')
@Check(
  '"original_transaction_reference" IS NULL OR ("original_transaction_reference" = BTRIM("original_transaction_reference") AND LENGTH("original_transaction_reference") BETWEEN 1 AND 512)',
)
@Index(
  'subscription_transaction_refe_provider_transaction_referenc_key',
  ['provider', 'transactionReference'],
  { unique: true },
)
@Index('idx_subscription_transactions_subscription', () => ({
  subscriptionId: 1,
  createdAt: -1,
}))
export class SubscriptionTransactionReference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId: string;

  @ManyToOne(() => UserSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: UserSubscription;

  @Column({ type: 'text' })
  provider: string;

  @Column({ name: 'transaction_reference', type: 'text' })
  transactionReference: string;

  @Column({
    name: 'original_transaction_reference',
    type: 'text',
    nullable: true,
  })
  originalTransactionReference: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
