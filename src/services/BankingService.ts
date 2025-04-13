import { AppDataSource } from '../config/database';
import { Account } from '../models/Account';
import logger from '../utils/logger';

// In a real implementation, this would integrate with a banking API
// For this example, we'll simulate banking operations

export class BankingService {
  private accountRepository = AppDataSource.getRepository(Account);
  
  async getAccountBalance(accountId: string): Promise<number | null> {
    try {
      logger.debug(`Retrieving balance for account ${accountId}`);
      
      // In a real system, this might call an external banking API
      // Here we'll just query our database
      
      const account = await this.accountRepository.findOne({
        where: { id: accountId }
      });
      
      if (!account) {
        logger.warn(`Account ${accountId} not found`);
        return null;
      }
      
      logger.debug(`Balance for account ${accountId}: ${account.balance}`);
      
      return account.balance;
      
    } catch (error) {
      logger.error(`Error retrieving account balance: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  async transferFunds(fromAccountId: string, toAccountId: string, amount: number): Promise<boolean> {
    const queryRunner = AppDataSource.createQueryRunner();
    
    try {
      logger.info(`Initiating fund transfer of ${amount} from account ${fromAccountId} to ${toAccountId}`);
      
      // Start transaction
      await queryRunner.connect();
      await queryRunner.startTransaction();
      
      // Get source account
      const sourceAccount = await queryRunner.manager.findOne(Account, {
        where: { id: fromAccountId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!sourceAccount) {
        logger.warn(`Source account ${fromAccountId} not found`);
        await queryRunner.rollbackTransaction();
        return false;
      }
      
      // Check if source account has sufficient funds
      if (sourceAccount.balance < amount) {
        logger.warn(`Insufficient funds in source account ${fromAccountId}`);
        await queryRunner.rollbackTransaction();
        return false;
      }
      
      // Get destination account
      const destAccount = await queryRunner.manager.findOne(Account, {
        where: { id: toAccountId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!destAccount) {
        logger.warn(`Destination account ${toAccountId} not found`);
        await queryRunner.rollbackTransaction();
        return false;
      }
      
      // Update account balances
      sourceAccount.balance -= amount;
      destAccount.balance += amount;
      
      // Save changes
      await queryRunner.manager.save(sourceAccount);
      await queryRunner.manager.save(destAccount);
      
      // Commit transaction
      await queryRunner.commitTransaction();
      
      logger.info(`Fund transfer of ${amount} completed successfully`);
      
      return true;
      
    } catch (error) {
      logger.error(`Error transferring funds: ${error instanceof Error ? error.message : String(error)}`);
      
      // Rollback transaction on error
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      return false;
      
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }
  
  async isAccountActive(accountId: string): Promise<boolean> {
    try {
      const account = await this.accountRepository.findOne({
        where: { id: accountId }
      });
      
      return account?.status === 'active';
      
    } catch (error) {
      logger.error(`Error checking account status: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
} 