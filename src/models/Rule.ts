import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Account } from './Account';

export enum RuleType {
  FRAUD_PREVENTION = 'fraud_prevention',
  USER_DEFINED = 'user_defined',
  SYSTEM = 'system'
}

export enum RuleAction {
  APPROVE = 'approve',
  DECLINE = 'decline',
  REVIEW = 'review',
  SWEEP = 'sweep',
  STEP_UP_AUTH = 'step_up_auth'
}

@Entity('rules')
export class Rule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ 
    type: 'enum', 
    enum: RuleType, 
    default: RuleType.USER_DEFINED 
  })
  type!: RuleType;

  @Column({ 
    type: 'enum', 
    enum: RuleAction, 
    default: RuleAction.DECLINE 
  })
  action!: RuleAction;

  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Column({ type: 'json' })
  conditions!: Record<string, any>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => Account, account => account.rules)
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @Column({ name: 'is_global', type: 'boolean', default: false })
  isGlobal!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
} 