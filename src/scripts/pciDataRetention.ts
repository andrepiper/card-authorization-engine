import { AppDataSource } from '../config/database';
import { Transaction } from '../models/Transaction';
import { Between, LessThan, In } from 'typeorm';
import logger from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Script to purge old card data that's no longer needed
 * This helps maintain PCI DSS compliance which requires minimizing data retention
 */
async function purgeOldCardData() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    logger.info('Database connection initialized');

    const retentionDays = parseInt(process.env.CARD_DATA_RETENTION_DAYS || '1');
    
    if (isNaN(retentionDays) || retentionDays < 1) {
      throw new Error('CARD_DATA_RETENTION_DAYS must be a positive number');
    }
    
    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    logger.info(`Purging card data older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);
    
    // Get the transaction repository
    const transactionRepository = AppDataSource.getRepository(Transaction);
    
    // Find all transactions older than the cutoff date
    const oldTransactions = await transactionRepository.find({
      where: {
        createdAt: LessThan(cutoffDate),
        // Only transactions that have card-related data
        paymentMethod: 'card'
      },
      select: ['id', 'transactionId', 'createdAt']
    });
    
    logger.info(`Found ${oldTransactions.length} transactions to purge card data from`);
    
    // Process transactions in batches to avoid memory issues
    const BATCH_SIZE = 100;
    let processed = 0;
    let updated = 0;
    
    for (let i = 0; i < oldTransactions.length; i += BATCH_SIZE) {
      const batch = oldTransactions.slice(i, i + BATCH_SIZE);
      const ids = batch.map(tx => tx.id);
      
      // Update the transactions, removing card data but keeping the transaction record
      const result = await transactionRepository.update(
        { id: In(ids) },
        {
          // Set card-related fields to null or undefined
          cardLast4: undefined,
          cardExpiryMonth: undefined,
          cardExpiryYear: undefined,
          paymentToken: undefined,
          // Add a note in metadata that card data was purged
          metadata: () => `
            CASE 
              WHEN metadata IS NULL THEN '{"cardDataPurged": true}'
              WHEN JSON_VALID(metadata) THEN JSON_SET(metadata, '$.cardDataPurged', true)
              ELSE '{"cardDataPurged": true}'
            END
          `
        }
      );
      
      processed += batch.length;
      updated += result.affected || 0;
      
      logger.info(`Processed ${processed}/${oldTransactions.length} transactions, updated ${updated} records`);
    }
    
    logger.info(`Completed data purge. Removed card data from ${updated} transactions`);
    
    // Close database connection
    await AppDataSource.destroy();
    logger.info('Database connection closed');
    
  } catch (error) {
    logger.error(`Error purging card data: ${error instanceof Error ? error.message : String(error)}`);
    
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    
    process.exit(1);
  }
}

// Run the purge function if this script is executed directly
if (require.main === module) {
  purgeOldCardData();
}

export default purgeOldCardData; 