import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { Transaction } from './Transaction';
import { Rule } from './Rule';

export enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked'
}

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_number', type: 'varchar', length: 50, unique: true })
  @Index()
  accountNumber!: string;

  @Column({ name: 'owner_name', type: 'varchar', length: 100 })
  ownerName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ 
    type: 'enum', 
    enum: AccountStatus, 
    default: AccountStatus.ACTIVE 
  })
  status!: AccountStatus;

  @Column({ name: 'is_sweep_enabled', type: 'boolean', default: false })
  isSweepEnabled!: boolean;

  @Column({ name: 'sweep_account_id', type: 'varchar', length: 36, nullable: true })
  sweepAccountId?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @OneToMany(() => Transaction, transaction => transaction.account)
  transactions?: Transaction[];

  @OneToMany(() => Rule, rule => rule.account)
  rules?: Rule[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
} 