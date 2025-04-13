import { Transaction } from '../models/Transaction';
import { Rule, RuleAction } from '../models/Rule';
import logger from '../utils/logger';
import stringSimilarity from 'string-similarity';
import natural from 'natural';
import { Account } from '../models/Account';
import { AppDataSource } from '../config/database';
import { MoreThan } from 'typeorm';

interface RuleResult {
  ruleId: string;
  ruleName: string;
  action: RuleAction;
  matched: boolean;
  conditions: Record<string, any>;
  evaluationTimeMs: number;
}

// Model weights for string similarity algorithms
interface StringMatchWeights {
  levenshtein: number;
  jaroWinkler: number;
  phonetic: number;
}

// Update RuleAction enum to include FLAG action if not already present
// This would normally be done in the Rule model, but we'll add it here for reference
enum BehavioralRuleAction {
  APPROVE = 'approve',
  DECLINE = 'decline',
  REVIEW = 'review',
  SWEEP = 'sweep',
  FLAG = 'flag',
  STEP_UP_AUTH = 'step_up_auth'
}

export class RuleEngineService {
  // Default confidence threshold for smart matching
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly MERCHANT_MATCH_THRESHOLD = 0.8;
  
  // Default weights for similarity algorithms (would come from a trained model in production)
  private readonly DEFAULT_WEIGHTS: StringMatchWeights = {
    levenshtein: 0.4,
    jaroWinkler: 0.4,
    phonetic: 0.2
  };

  async evaluateRules(transaction: Transaction, rules: Rule[]): Promise<RuleResult[]> {
    logger.debug(`Evaluating ${rules.length} rules for transaction ${transaction.transactionId}`);
    
    const results: RuleResult[] = [];
    
    // Sort rules by priority (lower number = higher priority)
    const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      const startTime = Date.now();
      
      try {
        const matched = await this.evaluateRule(transaction, rule);
        
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          matched,
          conditions: rule.conditions,
          evaluationTimeMs: Date.now() - startTime
        });
        
        logger.debug(`Rule ${rule.name} evaluation result: ${matched ? 'matched' : 'not matched'}`, {
          transactionId: transaction.transactionId,
          ruleId: rule.id,
          evaluationTimeMs: Date.now() - startTime
        });
        
      } catch (error) {
        logger.error(`Error evaluating rule ${rule.name}: ${error instanceof Error ? error.message : String(error)}`);
        
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: rule.action,
          matched: false,
          conditions: rule.conditions,
          evaluationTimeMs: Date.now() - startTime
        });
      }
    }
    
    return results;
  }
  
  private async evaluateRule(transaction: Transaction, rule: Rule): Promise<boolean> {
    // If no conditions are defined, the rule doesn't match
    if (!rule.conditions || Object.keys(rule.conditions).length === 0) {
      return false;
    }
    
    // Get transaction data to evaluate against
    const txData = this.prepareTransactionData(transaction);
    
    // Evaluate each condition using the appropriate method
    for (const [conditionType, conditionValue] of Object.entries(rule.conditions)) {
      const matchResult = await this.evaluateCondition(conditionType, conditionValue, txData, transaction);
      
      // If any condition fails, the rule doesn't match (AND logic)
      if (!matchResult) {
        return false;
      }
    }
    
    // Evaluate card-specific rules
    if (txData.paymentMethod === 'card' && rule.conditions.card) {
      const cardMatch = this.evaluateCardRule(rule.conditions.card, txData);
      if (cardMatch) {
        return true;
      }
    }
    
    // All conditions matched
    return true;
  }
  
  private prepareTransactionData(transaction: Transaction): Record<string, any> {
    // Use enriched data if available, otherwise use raw data
    const enrichedData = transaction.enrichedData || {};
    
    return {
      transactionId: transaction.transactionId,
      accountId: transaction.accountId,
      amount: transaction.amount,
      currency: transaction.currency,
      merchantName: enrichedData.merchantName || transaction.merchantName,
      merchantId: enrichedData.merchantId || transaction.merchantId,
      merchantCategory: enrichedData.merchantCategory || transaction.merchantCategory,
      merchantCategoryCode: enrichedData.merchantCategoryCode || transaction.merchantCategoryCode,
      location: enrichedData.location || transaction.location,
      countryCode: enrichedData.countryCode || transaction.countryCode,
      paymentToken: transaction.paymentToken,
      paymentMethod: transaction.paymentMethod,
      cardBrand: transaction.cardBrand,
      cardLast4: transaction.cardLast4,
      cardExpiryMonth: transaction.cardExpiryMonth,
      cardExpiryYear: transaction.cardExpiryYear,
      cardFingerprint: transaction.cardFingerprint,
      timestamp: transaction.createdAt,
      dayOfWeek: transaction.createdAt.getDay(),
      hourOfDay: transaction.createdAt.getHours(),
      // Flag to indicate if we're using enriched or raw data
      isEnriched: !!transaction.enrichedData
    };
  }
  
  private async evaluateCondition(
    conditionType: string, 
    conditionValue: any, 
    transactionData: Record<string, any>,
    originalTransaction: Transaction
  ): Promise<boolean> {
    switch (conditionType) {
      case 'amount_greater_than':
        return transactionData.amount > conditionValue;
        
      case 'amount_less_than':
        return transactionData.amount < conditionValue;
        
      case 'currency_equals':
        return transactionData.currency === conditionValue;
        
      case 'merchant_name_equals':
        // Use smart matching if we don't have enriched data
        if (!transactionData.isEnriched) {
          return this.smartStringMatch(transactionData.merchantName, conditionValue);
        }
        return this.stringMatch(transactionData.merchantName, conditionValue);
        
      case 'merchant_name_contains':
        // Use smart matching if we don't have enriched data
        if (!transactionData.isEnriched) {
          const confidenceScore = this.computeConfidenceScore(
            transactionData.merchantName || '', 
            conditionValue
          );
          // For 'contains', we use a lower threshold as we're just checking for substring
          return confidenceScore >= (this.CONFIDENCE_THRESHOLD * 0.8);
        }
        return this.stringContains(transactionData.merchantName, conditionValue);
        
      case 'merchant_category_equals':
        return this.stringMatch(transactionData.merchantCategory, conditionValue);
        
      case 'merchant_category_code_equals':
        return this.stringMatch(transactionData.merchantCategoryCode, conditionValue);
        
      case 'country_code_equals':
        return this.stringMatch(transactionData.countryCode, conditionValue);
        
      case 'country_code_in':
        return Array.isArray(conditionValue) && 
          conditionValue.some(code => this.stringMatch(transactionData.countryCode, code));
        
      case 'day_of_week_equals':
        return transactionData.dayOfWeek === conditionValue;
        
      case 'day_of_week_in':
        return Array.isArray(conditionValue) && conditionValue.includes(transactionData.dayOfWeek);
        
      case 'hour_of_day_between':
        return Array.isArray(conditionValue) && 
          conditionValue.length === 2 && 
          transactionData.hourOfDay >= conditionValue[0] && 
          transactionData.hourOfDay <= conditionValue[1];
        
      default:
        logger.warn(`Unknown condition type: ${conditionType}`);
        return false;
    }
  }
  
  private stringMatch(actual: string | undefined | null, expected: string): boolean {
    if (!actual) return false;
    
    // Case insensitive comparison
    return actual.toLowerCase() === expected.toLowerCase();
  }
  
  private stringContains(actual: string | undefined | null, expected: string): boolean {
    if (!actual) return false;
    
    // Case insensitive contains
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  
  /**
   * Calculates Levenshtein distance between two strings
   * and normalizes it to a similarity score between 0 and 1
   */
  private getLevenshteinSimilarity(s1: string, s2: string): number {
    const distance = natural.LevenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
    const maxLength = Math.max(s1.length, s2.length);
    
    // Normalize to a similarity score (1 = exact match, 0 = completely different)
    return maxLength > 0 ? 1 - (distance / maxLength) : 1;
  }
  
  /**
   * Gets Jaro-Winkler similarity between two strings (0-1 score)
   */
  private getJaroWinklerSimilarity(s1: string, s2: string): number {
    return stringSimilarity.compareTwoStrings(s1.toLowerCase(), s2.toLowerCase());
  }
  
  /**
   * Gets phonetic similarity between two strings using Metaphone
   * and normalizes to a score between 0 and 1
   */
  private getPhoneticSimilarity(s1: string, s2: string): number {
    const metaphone = new natural.Metaphone();
    const s1Phonetic = metaphone.process(s1);
    const s2Phonetic = metaphone.process(s2);
    
    // Compare the phonetic codes using Levenshtein distance
    const phoneticDistance = natural.LevenshteinDistance(s1Phonetic, s2Phonetic);
    const maxLength = Math.max(s1Phonetic.length, s2Phonetic.length);
    
    // Normalize to a similarity score
    return maxLength > 0 ? 1 - (phoneticDistance / maxLength) : 1;
  }
  
  /**
   * Computes a confidence score using multiple similarity metrics
   * and a weighted model (simulating a logistic regression output)
   */
  private computeConfidenceScore(actual: string, expected: string): number {
    if (!actual || !expected) return 0;
    
    // Clean the input strings (merchants often have special chars, etc.)
    const cleanActual = this.cleanMerchantName(actual);
    const cleanExpected = this.cleanMerchantName(expected);
    
    // Special case for very short strings, which can cause false positives
    if (cleanActual.length < 3 || cleanExpected.length < 3) {
      return cleanActual === cleanExpected ? 1 : 0;
    }
    
    // Get all similarity scores
    const levenshteinSimilarity = this.getLevenshteinSimilarity(cleanActual, cleanExpected);
    const jaroWinklerSimilarity = this.getJaroWinklerSimilarity(cleanActual, cleanExpected);
    const phoneticSimilarity = this.getPhoneticSimilarity(cleanActual, cleanExpected);
    
    // Extract weights from the model (in a real system, these would come from a trained model)
    const { levenshtein, jaroWinkler, phonetic } = this.DEFAULT_WEIGHTS;
    
    // Log the individual scores for debugging and tuning
    logger.debug(`String match metrics for "${cleanActual}" vs "${cleanExpected}":`, {
      levenshtein: levenshteinSimilarity,
      jaroWinkler: jaroWinklerSimilarity, 
      phonetic: phoneticSimilarity
    });
    
    // Compute weighted score (simulating logistic regression output)
    const confidenceScore = 
      (levenshteinSimilarity * levenshtein) +
      (jaroWinklerSimilarity * jaroWinkler) +
      (phoneticSimilarity * phonetic);
    
    return confidenceScore;
  }
  
  /**
   * Smart string matching that uses multiple algorithms and a confidence threshold
   */
  private smartStringMatch(actual: string | undefined | null, expected: string): boolean {
    if (!actual) return false;
    
    const confidenceScore = this.computeConfidenceScore(actual, expected);
    
    const result = confidenceScore >= this.CONFIDENCE_THRESHOLD;
    
    // Log match result with confidence score for analysis
    logger.debug(`Smart string match: "${actual}" vs "${expected}" = ${result} (score: ${confidenceScore.toFixed(2)})`);
    
    return result;
  }
  
  /**
   * Utility method to clean merchant names for more accurate matching
   */
  private cleanMerchantName(merchantName: string): string {
    if (!merchantName) return '';
    
    // Remove common prefixes and suffixes
    let cleaned = merchantName
      .replace(/^sq\*|^sq |^SQ\*|^SQ |^txn\*|^amzn\*|^pmt\*|^pp\*|^pypl\*/i, '') // Common payment prefixes
      .replace(/^\d+\s+/g, '') // Leading numbers
      .replace(/\bINC\b|\bLLC\b|\bLTD\b|\bCORP\b|\bCO\b/gi, '') // Company types
      .replace(/\d{4,}$/g, '') // Trailing numbers (often location codes)
      .replace(/\-\d+[a-z]*$/i, '') // Suffixes like -123 or -45A
      .replace(/[^\w\s]/g, ' ') // Replace non-alphanumeric with spaces
      .replace(/\s+/g, ' '); // Collapse multiple spaces
    
    // Remove extra whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
  }
  
  /**
   * Evaluates card-specific rule conditions
   */
  private evaluateCardRule(cardConditions: Record<string, any>, transactionData: Record<string, any>): boolean {
    // If any condition is met, the rule matches (unless logical operator is specified as 'and')
    let isMatch = false;
    const logicalOperator = cardConditions.operator || 'or';
    
    // Check card brand
    if (cardConditions.brands && transactionData.cardBrand) {
      const brands = Array.isArray(cardConditions.brands) 
        ? cardConditions.brands 
        : [cardConditions.brands];
      
      const brandMatch = brands.some(brand => 
        brand.toLowerCase() === transactionData.cardBrand.toLowerCase()
      );
      
      if (logicalOperator === 'or' && brandMatch) return true;
      if (logicalOperator === 'and' && !brandMatch) return false;
      
      isMatch = isMatch || brandMatch;
    }
    
    // Check high-risk tokens (e.g. previously identified as fraudulent)
    if (cardConditions.highRiskTokens && transactionData.paymentToken) {
      const tokens = Array.isArray(cardConditions.highRiskTokens) 
        ? cardConditions.highRiskTokens 
        : [cardConditions.highRiskTokens];
      
      const tokenMatch = tokens.includes(transactionData.paymentToken);
      
      if (logicalOperator === 'or' && tokenMatch) return true;
      if (logicalOperator === 'and' && !tokenMatch) return false;
      
      isMatch = isMatch || tokenMatch;
    }
    
    // Check card expiry
    if (cardConditions.requireValidExpiry && 
        (transactionData.cardExpiryMonth && transactionData.cardExpiryYear)) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // 0-indexed
      
      const expiryYear = transactionData.cardExpiryYear;
      const expiryMonth = transactionData.cardExpiryMonth;
      
      const isExpired = (expiryYear < currentYear) || 
                       (expiryYear === currentYear && expiryMonth < currentMonth);
      
      const expiryValid = !isExpired;
      
      if (logicalOperator === 'or' && expiryValid) return true;
      if (logicalOperator === 'and' && !expiryValid) return false;
      
      isMatch = isMatch || expiryValid;
    }
    
    // Check fingerprint frequency (detect multiple purchases with same card in short period)
    if (cardConditions.fingerprintFrequency && 
        transactionData.cardFingerprint) {
      // In a real implementation, this would query recent transactions with this fingerprint
      // For this example, we'll just assume it passes
      const passesFrequencyCheck = true;
      
      if (logicalOperator === 'or' && passesFrequencyCheck) return true;
      if (logicalOperator === 'and' && !passesFrequencyCheck) return false;
      
      isMatch = isMatch || passesFrequencyCheck;
    }
    
    return isMatch;
  }

  /**
   * Analyzes transaction against account history to detect behavioral anomalies
   */
  public async evaluateBehavioralPatterns(transaction: Transaction, account: Account): Promise<RuleResult[]> {
    const results: RuleResult[] = [];
    const startTime = Date.now();
    
    try {
      // Get account transaction history
      const txHistory = await this.getAccountTransactionHistory(account.id);
      
      // 1. Check for new payment methods/cards
      const cardResult = await this.detectNewPaymentMethod(transaction, txHistory);
      if (cardResult) results.push(cardResult);
      
      // 2. Check for unusual transaction amount
      const amountResult = await this.detectAmountAnomaly(transaction, txHistory);
      if (amountResult) results.push(amountResult);
      
      // 3. Check for unusual merchant category
      const categoryResult = await this.detectMerchantCategoryAnomaly(transaction, txHistory);
      if (categoryResult) results.push(categoryResult);
      
      // 4. Check for unusual location/country
      const locationResult = await this.detectLocationAnomaly(transaction, txHistory, account);
      if (locationResult) results.push(locationResult);
      
      // 5. Check for unusual time pattern
      const timeResult = await this.detectTimePatternAnomaly(transaction, txHistory);
      if (timeResult) results.push(timeResult);
      
      // 6. Check for velocity patterns
      const velocityResult = await this.detectVelocityAnomaly(transaction);
      if (velocityResult) results.push(velocityResult);
      
      return results;
    } catch (error) {
      logger.error(`Error in behavioral analysis: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Detects if this transaction uses a new payment method for this account
   */
  private async detectNewPaymentMethod(transaction: Transaction, history: Transaction[]): Promise<RuleResult | null> {
    // Skip if no payment token or card fingerprint
    if (!transaction.paymentToken && !transaction.cardFingerprint) {
      return null;
    }
    
    const startTime = Date.now();
    
    // Check if this card has been used before
    const isNewCard = !history.some(tx => 
      (transaction.cardFingerprint && tx.cardFingerprint === transaction.cardFingerprint) || 
      (transaction.paymentToken && tx.paymentToken === transaction.paymentToken)
    );
    
    if (isNewCard) {
      // Check if this account has any previous card transactions
      const hasCardHistory = history.some(tx => tx.paymentMethod === 'card');
      
      // If this account has used cards before but this is a new card, flag it
      if (hasCardHistory) {
        return {
          ruleId: 'behavioral_new_card',
          ruleName: 'New Payment Method Detection',
          action: RuleAction.REVIEW,
          matched: true,
          conditions: {
            isNewCard: true,
            hasCardHistory: true
          },
          evaluationTimeMs: Date.now() - startTime
        };
      }
    }
    
    return null;
  }

  /**
   * Detects transactions with amounts significantly different from account history
   */
  private async detectAmountAnomaly(transaction: Transaction, history: Transaction[]): Promise<RuleResult | null> {
    if (history.length < 3) {
      return null; // Not enough history to establish pattern
    }
    
    const startTime = Date.now();
    
    // Calculate statistics from transaction history
    const amounts = history.map(tx => tx.amount);
    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    
    // Calculate standard deviation
    const squareDiffs = amounts.map(amount => {
      const diff = amount - average;
      return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((sum, diff) => sum + diff, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);
    
    // Calculate Z-score (how many standard deviations from mean)
    const zScore = (transaction.amount - average) / (stdDev || 1); // Avoid division by zero
    
    // Flag transactions more than 3 standard deviations from mean
    if (zScore > 3) {
      return {
        ruleId: 'behavioral_amount_anomaly',
        ruleName: 'Transaction Amount Anomaly',
        action: RuleAction.REVIEW,
        matched: true,
        conditions: {
          zScore,
          average,
          stdDev,
          transactionAmount: transaction.amount
        },
        evaluationTimeMs: Date.now() - startTime
      };
    }
    
    return null;
  }

  /**
   * Detects transactions in unusual merchant categories for this account
   */
  private async detectMerchantCategoryAnomaly(transaction: Transaction, history: Transaction[]): Promise<RuleResult | null> {
    // Skip if no merchant category code
    if (!transaction.merchantCategoryCode || history.length < 5) {
      return null;
    }
    
    const startTime = Date.now();
    
    // Get all merchant categories used by this account
    const usedCategories = new Set(
      history
        .filter(tx => tx.merchantCategoryCode)
        .map(tx => tx.merchantCategoryCode)
    );
    
    // Check if this category has been used before
    if (!usedCategories.has(transaction.merchantCategoryCode)) {
      // New category is not automatically suspicious, but worth checking
      // with other risk factors
      return {
        ruleId: 'behavioral_new_merchant_category',
        ruleName: 'New Merchant Category',
        action: RuleAction.REVIEW,
        matched: true,
        conditions: {
          newCategory: transaction.merchantCategoryCode,
          usedCategories: Array.from(usedCategories)
        },
        evaluationTimeMs: Date.now() - startTime
      };
    }
    
    return null;
  }

  /**
   * Detects transactions in unusual locations for this account
   */
  private async detectLocationAnomaly(
    transaction: Transaction, 
    history: Transaction[], 
    account: Account
  ): Promise<RuleResult | null> {
    // Skip if no country code
    if (!transaction.countryCode) {
      return null;
    }
    
    const startTime = Date.now();
    
    // Check if account has usual countries defined
    let usualCountries: string[] = [];
    if (account.metadata?.usualCountries) {
      try {
        usualCountries = JSON.parse(account.metadata.usualCountries);
      } catch (e) {
        // If parsing fails, continue with empty array
      }
    }
    
    // If no usual countries defined, extract from history
    if (usualCountries.length === 0 && history.length > 0) {
      const countryCounts = history
        .filter(tx => tx.countryCode)
        .reduce((counts, tx) => {
          counts[tx.countryCode!] = (counts[tx.countryCode!] || 0) + 1;
          return counts;
        }, {} as Record<string, number>);
      
      // Consider countries used in at least 10% of transactions as "usual"
      const minCount = Math.max(1, Math.ceil(history.length * 0.1));
      usualCountries = Object.entries(countryCounts)
        .filter(([_, count]) => count >= minCount)
        .map(([country, _]) => country);
    }
    
    // Check if current country is unusual
    if (usualCountries.length > 0 && !usualCountries.includes(transaction.countryCode)) {
      return {
        ruleId: 'behavioral_unusual_country',
        ruleName: 'Unusual Transaction Location',
        action: RuleAction.REVIEW,
        matched: true,
        conditions: {
          transactionCountry: transaction.countryCode,
          usualCountries
        },
        evaluationTimeMs: Date.now() - startTime
      };
    }
    
    return null;
  }

  /**
   * Detects transactions occurring at unusual times for this account
   */
  private async detectTimePatternAnomaly(transaction: Transaction, history: Transaction[]): Promise<RuleResult | null> {
    if (history.length < 10) {
      return null; // Not enough history to establish time pattern
    }
    
    const startTime = Date.now();
    
    // Current transaction hour
    const txHour = transaction.createdAt.getHours();
    
    // Count transactions by hour of day
    const hourCounts = history.reduce((counts, tx) => {
      const hour = tx.createdAt.getHours();
      counts[hour] = (counts[hour] || 0) + 1;
      return counts;
    }, {} as Record<number, number>);
    
    // Calculate total transactions
    const totalTx = history.length;
    
    // Check if current hour is unusual (less than 5% of transactions)
    const currentHourCount = hourCounts[txHour] || 0;
    const hourPercentage = (currentHourCount / totalTx) * 100;
    
    if (hourPercentage < 5) {
      return {
        ruleId: 'behavioral_unusual_time',
        ruleName: 'Unusual Transaction Time',
        action: RuleAction.REVIEW,
        matched: true,
        conditions: {
          transactionHour: txHour,
          hourPercentage,
          hourCounts
        },
        evaluationTimeMs: Date.now() - startTime
      };
    }
    
    return null;
  }

  /**
   * Detects transaction velocity anomalies (multiple transactions in short timeframe)
   */
  private async detectVelocityAnomaly(transaction: Transaction): Promise<RuleResult | null> {
    const startTime = Date.now();
    
    // Get repository for transaction queries
    const txRepo = AppDataSource.getRepository(Transaction);
    
    // Check card velocity (same card used multiple times in short period)
    if (transaction.cardFingerprint) {
      const cardVelocityWindow = 30; // minutes
      const cardVelocityThreshold = 3; // transactions
      
      // Calculate time window
      const velocityTime = new Date();
      velocityTime.setMinutes(velocityTime.getMinutes() - cardVelocityWindow);
      
      // Count transactions with same card in window
      const cardTxCount = await txRepo.count({
        where: {
          cardFingerprint: transaction.cardFingerprint,
          createdAt: MoreThan(velocityTime)
        }
      });
      
      if (cardTxCount >= cardVelocityThreshold) {
        return {
          ruleId: 'velocity_card',
          ruleName: 'Card Velocity Check',
          action: RuleAction.REVIEW,
          matched: true,
          conditions: {
            cardFingerprint: transaction.cardFingerprint,
            timeWindowMinutes: cardVelocityWindow,
            threshold: cardVelocityThreshold,
            count: cardTxCount
          },
          evaluationTimeMs: Date.now() - startTime
        };
      }
    }
    
    // Check account velocity
    const accountVelocityWindow = 60; // minutes
    const accountVelocityThreshold = 5; // transactions
    
    // Calculate time window
    const velocityTime = new Date();
    velocityTime.setMinutes(velocityTime.getMinutes() - accountVelocityWindow);
    
    // Count transactions for same account in window
    const accountTxCount = await txRepo.count({
      where: {
        accountId: transaction.accountId,
        createdAt: MoreThan(velocityTime)
      }
    });
    
    if (accountTxCount >= accountVelocityThreshold) {
      return {
        ruleId: 'velocity_account',
        ruleName: 'Account Velocity Check',
        action: RuleAction.REVIEW,
        matched: true,
        conditions: {
          accountId: transaction.accountId,
          timeWindowMinutes: accountVelocityWindow,
          threshold: accountVelocityThreshold,
          count: accountTxCount
        },
        evaluationTimeMs: Date.now() - startTime
      };
    }
    
    return null;
  }

  /**
   * Gets recent transaction history for an account
   */
  private async getAccountTransactionHistory(accountId: string, limit: number = 50): Promise<Transaction[]> {
    const txRepo = AppDataSource.getRepository(Transaction);
    
    return txRepo.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: limit
    });
  }
} 