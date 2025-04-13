import { Transaction } from '../models/Transaction';
import logger from '../utils/logger';

// This would typically call an external API or service
// For this example, we'll simulate the enrichment process

interface EnrichedData {
  merchantName: string;
  merchantCategory: string;
  merchantCategoryCode: string;
  location: string;
  countryCode: string;
  isHighRisk: boolean;
  confidence: number;
  enrichmentSource: string;
}

// Mock merchant category code mapping
const merchantCategoryMap: Record<string, string> = {
  '5411': 'Grocery Stores',
  '5812': 'Restaurants',
  '5814': 'Fast Food Restaurants',
  '5912': 'Drug Stores',
  '5942': 'Book Stores',
  '7011': 'Hotels and Lodging',
  '7512': 'Car Rental',
  '4121': 'Taxi/Limousines',
  '5999': 'Miscellaneous Retail',
  '7299': 'Miscellaneous Services',
  '7995': 'Gambling',
  '6011': 'ATM',
  '4829': 'Money Transfer',
  '4900': 'Utilities'
};

// Mock high-risk merchant categories
const highRiskCategories = ['7995', '6011', '4829'];

export class EnrichmentService {
  async enrichTransactionData(transaction: Transaction): Promise<EnrichedData> {
    try {
      logger.debug(`Enriching transaction data for ${transaction.transactionId}`);
      
      // In a real implementation, this would call an external service
      // For example, a merchant data provider or internal database
      
      // Simulate API latency
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Get the raw merchant data
      const rawMerchantName = transaction.merchantName;
      const rawMerchantCategoryCode = transaction.merchantCategoryCode || '';
      
      // Clean and normalize merchant name
      const cleanMerchantName = this.cleanMerchantName(rawMerchantName);
      
      // Get merchant category from MCC if available
      const merchantCategory = merchantCategoryMap[rawMerchantCategoryCode] || 'Unknown';
      
      // Determine if this is a high-risk merchant category
      const isHighRisk = highRiskCategories.includes(rawMerchantCategoryCode);
      
      // Prepare enriched data
      const enrichedData: EnrichedData = {
        merchantName: cleanMerchantName,
        merchantCategory,
        merchantCategoryCode: rawMerchantCategoryCode,
        location: transaction.location || 'Unknown',
        countryCode: transaction.countryCode || 'US',
        isHighRisk,
        confidence: 0.95, // Confidence score for the enrichment
        enrichmentSource: 'internal-db' // Source of the enrichment data
      };
      
      logger.debug(`Enrichment completed for ${transaction.transactionId}`, {
        transactionId: transaction.transactionId,
        merchantName: cleanMerchantName
      });
      
      return enrichedData;
      
    } catch (error) {
      logger.error(`Enrichment error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return basic enrichment with available data
      return {
        merchantName: transaction.merchantName,
        merchantCategory: 'Unknown',
        merchantCategoryCode: transaction.merchantCategoryCode || '',
        location: transaction.location || 'Unknown',
        countryCode: transaction.countryCode || 'US',
        isHighRisk: false,
        confidence: 0.5,
        enrichmentSource: 'fallback'
      };
    }
  }
  
  private cleanMerchantName(merchantName: string): string {
    if (!merchantName) return 'Unknown';
    
    // Remove common prefixes and suffixes
    let cleaned = merchantName
      .replace(/^sq\*|^sq |^SQ\*|^SQ /, '') // Square payments prefix
      .replace(/^paypal\*|^PAYPAL\*/, '') // PayPal prefix
      .replace(/\bINC\b|\bLLC\b|\bLTD\b|\bCORP\b/i, '') // Company types
      .replace(/\d{4,}$/g, '') // Trailing numbers (often location codes)
      .replace(/\-\d+[a-z]*$/i, ''); // Suffixes like -123 or -45A
    
    // Remove extra whitespace
    cleaned = cleaned.trim().replace(/\s+/g, ' ');
    
    // Convert to title case
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return cleaned;
  }
} 