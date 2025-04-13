import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Account } from './Account';

export enum TransactionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  FAILED = 'failed'
}

export enum TransactionType {
  PURCHASE = 'purchase',
  REFUND = 'refund',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer'
}

export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  WALLET = 'wallet',
  CASH = 'cash',
  OTHER = 'other'
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'varchar', length: 50 })
  @Index()
  transactionId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ name: 'account_id' })
  accountId!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'merchant_name', type: 'varchar', length: 100 })
  merchantName!: string;

  @Column({ name: 'merchant_id', type: 'varchar', length: 50, nullable: true })
  merchantId?: string;

  @Column({ name: 'merchant_category_code', type: 'varchar', length: 4, nullable: true })
  merchantCategoryCode?: string;

  @Column({ name: 'merchant_category', type: 'varchar', length: 100, nullable: true })
  merchantCategory?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location?: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode?: string;

  @Column({ 
    type: 'enum', 
    enum: TransactionType, 
    default: TransactionType.PURCHASE 
  })
  type!: TransactionType;

  @Column({ 
    type: 'enum', 
    enum: TransactionStatus, 
    default: TransactionStatus.PENDING 
  })
  status!: TransactionStatus;

  @Column({ name: 'payment_token', type: 'varchar', length: 100, nullable: true })
  paymentToken?: string;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 20,
    nullable: true
  })
  paymentMethod?: string;

  @Column({ name: 'card_brand', type: 'varchar', length: 20, nullable: true })
  cardBrand?: string;

  @Column({ name: 'card_last4', type: 'varchar', length: 4, nullable: true })
  cardLast4?: string;

  @Column({ name: 'card_expiry_month', type: 'smallint', nullable: true })
  cardExpiryMonth?: number;

  @Column({ name: 'card_expiry_year', type: 'smallint', nullable: true })
  cardExpiryYear?: number;

  @Column({ name: 'card_fingerprint', type: 'varchar', length: 100, nullable: true })
  cardFingerprint?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ name: 'enriched_data', type: 'json', nullable: true })
  enrichedData?: Record<string, any>;

  @Column({ name: 'decline_reason', type: 'varchar', length: 255, nullable: true })
  declineReason?: string;

  @Column({ name: 'is_fraudulent', type: 'boolean', default: false })
  isFraudulent!: boolean;

  @Column({ name: 'applied_rules', type: 'json', nullable: true })
  appliedRules?: Record<string, any>;

  @Column({ name: 'processing_time_ms', type: 'int', default: 0 })
  processingTimeMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  createdAt!: Date;

  @Column({ name: 'processed_at', nullable: true })
  processedAt?: Date;
} 