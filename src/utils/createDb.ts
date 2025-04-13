import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from './logger';

dotenv.config();

/**
 * Create the database if it doesn't exist
 */
export async function createDatabase(): Promise<boolean> {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306');
  const user = process.env.DB_USERNAME || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'card_authorization';
  
  try {
    // Create a connection without specifying a database
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password
    });
    
    logger.info(`Checking if database '${dbName}' exists`);
    
    // Check if the database exists
    const [rows] = await connection.execute(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [dbName]
    );
    
    // @ts-ignore
    if (rows.length === 0) {
      logger.info(`Database '${dbName}' does not exist. Creating...`);
      
      // Create the database with proper charset
      await connection.execute(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      
      logger.info(`Database '${dbName}' created successfully`);
    } else {
      logger.info(`Database '${dbName}' already exists`);
    }
    
    await connection.end();
    return true;
  } catch (error) {
    logger.error(`Error creating database: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
} 