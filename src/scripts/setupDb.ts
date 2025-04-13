import '../utils/logger';
import { initializeDatabase } from '../utils/initDb';
import logger from '../utils/logger';

/**
 * Script to set up the database schema
 */
async function setupDatabase() {
  try {
    logger.info('Setting up database...');
    await initializeDatabase();
    logger.info('Database setup completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error(`Database setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the setup
setupDatabase(); 