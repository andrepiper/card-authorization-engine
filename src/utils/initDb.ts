import { AppDataSource } from '../config/database';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import { createDatabase } from './createDb';

/**
 * Initialize the database using the SQL script
 */
export async function initializeDatabase() {
  try {
    // Create database if it doesn't exist
    await createDatabase();
    
    // Initialize connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    
    await AppDataSource.initialize();
    logger.info('Database connection established successfully');
    
    // Check if tables exist
    const tablesExist = await checkIfTablesExist();
    
    if (!tablesExist) {
      logger.info('Tables do not exist. Creating database schema...');
      
      // Read schema file
      const schemaPath = path.join(process.cwd(), 'db', 'mysql-schema.sql');
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema file not found at ${schemaPath}`);
      }
      
      const schemaScript = fs.readFileSync(schemaPath, 'utf8');
      
      // Use connection from TypeORM to execute the SQL script
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      
      // Split script by semicolons and execute each statement
      const statements = schemaScript
        .split(';')
        .filter(stmt => stmt.trim() !== '')
        .map(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.includes('CREATE DATABASE') || statement.includes('USE ')) {
          continue; // Skip database creation and use statements
        }
        try {
          await queryRunner.query(statement + ';');
        } catch (err) {
          logger.error(`Error executing SQL statement: ${statement}`);
          logger.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          // Continue with other statements
        }
      }
      
      logger.info('Database schema created successfully');
      await queryRunner.release();
    } else {
      logger.info('Tables already exist. Skipping schema creation.');
    }
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
    
    // Clean up if there was an error
    if (AppDataSource.isInitialized) {
      try {
        await AppDataSource.destroy();
      } catch (cleanupError) {
        logger.error(`Error cleaning up database connection: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    
    throw error;
  }
}

/**
 * Check if the tables already exist in the database
 */
async function checkIfTablesExist(): Promise<boolean> {
  try {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    
    const requiredTables = ['accounts', 'rules', 'transactions'];
    const dbName = AppDataSource.options.database as string;
    
    // Check for each table
    for (const table of requiredTables) {
      const result = await queryRunner.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = ? AND table_name = ?`,
        [dbName, table]
      );
      
      if (result[0].count === 0) {
        await queryRunner.release();
        return false;
      }
    }
    
    await queryRunner.release();
    return true;
  } catch (error) {
    logger.error(`Error checking if tables exist: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
} 