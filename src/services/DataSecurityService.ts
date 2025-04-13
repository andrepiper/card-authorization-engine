import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import logger from '../utils/logger';

// Load environment variables
dotenv.config();

export class DataSecurityService {
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly ENCRYPTION_IV_LENGTH: number = 16;
  private readonly ENCRYPTION_ALGORITHM: string = 'aes-256-cbc';
  private readonly PCI_FIELDS: string[] = [
    'cardNumber', 
    'cvv', 
    'cardholderName', 
    'cardTrack1', 
    'cardTrack2',
    'pin'
  ];
  
  constructor() {
    // Ensure encryption key is available in environment variables
    const encryptionKeyBase64 = process.env.ENCRYPTION_KEY;
    if (!encryptionKeyBase64) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    
    // Convert BASE64 key to Buffer
    this.ENCRYPTION_KEY = Buffer.from(encryptionKeyBase64, 'base64');
    
    // Validate key length for AES-256
    if (this.ENCRYPTION_KEY.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) for AES-256');
    }
  }
  
  /**
   * Tokenize a PAN (Primary Account Number) for secure storage
   * Returns a token that can be stored in the database
   */
  tokenizeCardNumber(pan: string): string {
    if (!this.isValidPan(pan)) {
      throw new Error('Invalid PAN format');
    }
    
    // Create a unique token ID
    const tokenId = uuidv4();
    
    // Encrypt the PAN with the token ID as additional data
    const encryptedPan = this.encrypt(pan);
    
    // TODO: In a production system, store the mapping between tokenId and encryptedPan
    // in a separate PCI-compliant secure vault or token vault service
    
    // Return the token ID as the token
    return tokenId;
  }
  
  /**
   * Get last 4 digits of PAN without storing the full PAN
   */
  getCardLast4(pan: string): string {
    if (!this.isValidPan(pan)) {
      throw new Error('Invalid PAN format');
    }
    
    return pan.slice(-4);
  }
  
  /**
   * Mask PAN for display purposes - only shows last 4 digits
   */
  maskPan(pan: string): string {
    if (!this.isValidPan(pan)) {
      throw new Error('Invalid PAN format');
    }
    
    const last4 = pan.slice(-4);
    const prefix = pan.slice(0, 6);
    const maskedMiddle = '*'.repeat(pan.length - 10);
    
    return `${prefix}${maskedMiddle}${last4}`;
  }
  
  /**
   * Returns the card's BIN (Bank Identification Number, first 6 digits)
   */
  getCardBin(pan: string): string {
    if (!this.isValidPan(pan)) {
      throw new Error('Invalid PAN format');
    }
    
    return pan.slice(0, 6);
  }
  
  /**
   * Validate if a string could be a valid PAN using Luhn algorithm
   */
  isValidPan(pan: string): boolean {
    // Basic format check
    if (!pan || !/^\d{13,19}$/.test(pan)) {
      return false;
    }
    
    // Luhn algorithm check
    const digits = pan.split('').map(Number);
    let sum = 0;
    let shouldDouble = false;
    
    // Start from the rightmost digit and move left
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    
    return sum % 10 === 0;
  }
  
  /**
   * Generate a card fingerprint (one-way hash) for uniquely identifying a card
   * without storing sensitive card data
   */
  generateCardFingerprint(pan: string, expMonth: number, expYear: number): string {
    if (!this.isValidPan(pan)) {
      throw new Error('Invalid PAN format');
    }
    
    // Create a string that uniquely identifies the card but doesn't contain the full PAN
    const dataToHash = `${this.getCardBin(pan)}${pan.slice(-4)}${expMonth}${expYear}`;
    
    // Create a SHA-256 hash
    const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    
    return hash;
  }
  
  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    // Generate a random IV for each encryption
    const iv = crypto.randomBytes(this.ENCRYPTION_IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.ENCRYPTION_KEY, iv);
    
    // Encrypt data
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data for storage
    // Format: hex(iv) + ':' + hex(encrypted)
    return `${iv.toString('hex')}:${encrypted}`;
  }
  
  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    // Split IV and encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, this.ENCRYPTION_KEY, iv);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Securely log data by removing/masking PCI fields
   */
  secureSanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const sanitized = { ...obj };
    
    // Recursively sanitize objects
    for (const key in sanitized) {
      // If this is a PCI field, redact it
      if (this.PCI_FIELDS.includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (key === 'cardNumber' || key === 'pan') {
        // If it's a PAN, we can mask it instead of completely redacting
        try {
          sanitized[key] = this.isValidPan(sanitized[key]) ? 
            this.maskPan(sanitized[key]) : '[REDACTED]';
        } catch (e) {
          sanitized[key] = '[REDACTED]';
        }
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.secureSanitizeObject(sanitized[key]);
      }
    }
    
    return sanitized;
  }
} 