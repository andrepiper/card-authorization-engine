import { Transaction, TransactionStatus } from '../models/Transaction';
import { Account } from '../models/Account';
import { Rule, RuleAction } from '../models/Rule';
import { AppDataSource } from '../config/database';
import logger from '../utils/logger';
import { EnrichmentService } from './EnrichmentService';
import { RuleEngineService } from './RuleEngineService';
import { BankingService } from './BankingService';
import { DataSecurityService } from './DataSecurityService';

interface AuthorizationRequest {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  merchantName: string;
  merchantId?: string;
  merchantCategoryCode?: string;
  location?: string;
  countryCode?: string;
  paymentToken?: string;
  paymentMethod?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpiryMonth?: number;
  cardExpiryYear?: number;
  cardFingerprint?: string;
  cardNumber?: string; // Will be tokenized, never stored
  cvv?: string; // Will never be stored
  metadata?: Record<string, any>;
}

interface AuthorizationResponse {
  decision: 'approve' | 'decline';
  transactionId: string;
  accountId: string;
  reasonCode?: string;
  processingTimeMs: number;
}

interface RuleResult {
  ruleId: string;
  ruleName: string;
  action: RuleAction;
  matched: boolean;
  conditions: Record<string, any>;
  evaluationTimeMs: number;
}

export class AuthorizationService {
  private accountRepository = AppDataSource.getRepository(Account);
  private transactionRepository = AppDataSource.getRepository(Transaction);
  private ruleRepository = AppDataSource.getRepository(Rule);
  private enrichmentService: EnrichmentService;
  private ruleEngineService: RuleEngineService;
  private bankingService: BankingService;
  private dataSecurityService: DataSecurityService;
  
  private readonly ENRICHMENT_TIMEOUT_MS: number;
  private readonly BANKING_API_TIMEOUT_MS: number;
  
  constructor() {
    this.enrichmentService = new EnrichmentService();
    this.ruleEngineService = new RuleEngineService();
    this.bankingService = new BankingService();
    this.dataSecurityService = new DataSecurityService();
    
    this.ENRICHMENT_TIMEOUT_MS = parseInt(process.env.ENRICHMENT_TIMEOUT_MS || '200');
    this.BANKING_API_TIMEOUT_MS = parseInt(process.env.BANKING_API_TIMEOUT_MS || '300');
  }
  
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing authorization request for transaction ${request.transactionId}`, { 
        transactionId: request.transactionId,
        accountId: request.accountId
      });
      
      // Validate account ID format
      const accountId = await this.validateAccountId(request.accountId);
      if (!accountId) {
        return this.createErrorResponse(request, 'account_not_found', startTime);
      }
      
      // Update the request with the validated account ID
      request.accountId = accountId;
      
      // Create transaction record
      const transaction = await this.createTransaction(request);
      
      // Get account details
      const account = await this.accountRepository.findOne({
        where: { id: request.accountId },
        relations: ['rules']
      });
      
      if (!account) {
        return this.declineTransaction(transaction, 'account_not_found', startTime);
      }
      
      if (account.status !== 'active') {
        return this.declineTransaction(transaction, 'account_inactive', startTime);
      }
      
      // Enrich transaction data with timeout
      const enrichmentPromise = this.enrichmentService.enrichTransactionData(transaction);
      const enrichmentTimeoutPromise = new Promise<void>(resolve => {
        setTimeout(resolve, this.ENRICHMENT_TIMEOUT_MS);
      });
      
      try {
        const enrichedData = await Promise.race([
          enrichmentPromise,
          enrichmentTimeoutPromise.then(() => {
            logger.warn(`Enrichment service timed out for transaction ${transaction.transactionId}`);
            return null;
          })
        ]);
        
        if (enrichedData) {
          transaction.enrichedData = enrichedData;
          await this.transactionRepository.save(transaction);
        }
      } catch (error) {
        logger.error(`Enrichment service error: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with unenriched data
      }
      
      // Load rules
      const accountRules = account.rules || [];
      const globalRules = await this.ruleRepository.find({
        where: { isGlobal: true, isActive: true },
        order: { priority: 'ASC' }
      });
      
      const rules = [...accountRules, ...globalRules].filter(rule => rule.isActive);
      
      // Evaluate rules
      const ruleResults = await this.ruleEngineService.evaluateRules(transaction, rules);
      
      // Perform behavioral analysis
      logger.info(`Performing behavioral analysis for transaction ${transaction.transactionId}`);
      const behavioralResults = await this.ruleEngineService.evaluateBehavioralPatterns(transaction, account);
      
      // Combine standard rules and behavioral analysis results
      transaction.appliedRules = [...ruleResults, ...behavioralResults];
      
      // Process rule results including behavioral analysis
      const declineRules = transaction.appliedRules.filter(
        (result: RuleResult) => result.action === RuleAction.DECLINE && result.matched
      );
      
      // Check if any behavioral patterns require step-up authentication
      const stepUpAuthRules = transaction.appliedRules.filter(
        (result: RuleResult) => result.action === RuleAction.STEP_UP_AUTH && result.matched
      );
      
      // If step-up authentication is required but not provided, decline with reason
      if (stepUpAuthRules.length > 0 && !request.metadata?.additionalAuthProvided) {
        return this.declineTransaction(
          transaction,
          `additional_auth_required`,
          startTime,
          stepUpAuthRules[0].ruleId
        );
      }
      
      // Continue with standard processing for decline rules
      if (declineRules.length > 0) {
        const declineRule = declineRules[0]; // Get highest priority decline rule
        return this.declineTransaction(
          transaction,
          `rule_${declineRule.ruleId}`,
          startTime
        );
      }
      
      // Check if there's a sweep rule that matched
      const sweepRules = transaction.appliedRules.filter((result: RuleResult) => result.action === RuleAction.SWEEP && result.matched);
      
      if (sweepRules.length > 0 && account.balance < request.amount) {
        // Attempt fund sweep
        if (account.isSweepEnabled && account.sweepAccountId) {
          try {
            const sweepResult = await Promise.race([
              this.bankingService.transferFunds(account.sweepAccountId, account.id, request.amount),
              new Promise<boolean>(resolve => {
                setTimeout(() => resolve(false), this.BANKING_API_TIMEOUT_MS);
              })
            ]);
            
            if (sweepResult) {
              // Refresh account balance after sweep
              const updatedAccount = await this.accountRepository.findOne({
                where: { id: account.id }
              });
              
              if (updatedAccount && updatedAccount.balance >= request.amount) {
                return this.approveTransaction(transaction, startTime);
              }
            }
          } catch (error) {
            logger.error(`Fund sweep error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Check if account has sufficient funds
      if (account.balance < request.amount) {
        return this.declineTransaction(transaction, 'insufficient_funds', startTime);
      }
      
      // All checks passed, approve the transaction
      return this.approveTransaction(transaction, startTime);
      
    } catch (error) {
      logger.error(`Authorization error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fail-safe approach: if we encounter an error in processing,
      // create a failed transaction record and return a decline
      try {
        const transaction = new Transaction();
        // Instead of Object.assign, explicitly set the fields
        transaction.transactionId = request.transactionId;
        transaction.accountId = request.accountId;
        transaction.amount = request.amount;
        transaction.currency = request.currency;
        transaction.merchantName = request.merchantName;
        // Set other fields if available
        if (request.merchantId) transaction.merchantId = request.merchantId;
        if (request.merchantCategoryCode) transaction.merchantCategoryCode = request.merchantCategoryCode;
        if (request.location) transaction.location = request.location;
        if (request.countryCode) transaction.countryCode = request.countryCode;
        
        // Set card-related fields if available
        if (request.paymentMethod) transaction.paymentMethod = request.paymentMethod;
        if (request.paymentToken) transaction.paymentToken = request.paymentToken;
        if (request.cardBrand) transaction.cardBrand = request.cardBrand;
        if (request.cardLast4) transaction.cardLast4 = request.cardLast4;
        if (request.cardExpiryMonth !== undefined) transaction.cardExpiryMonth = request.cardExpiryMonth;
        if (request.cardExpiryYear !== undefined) transaction.cardExpiryYear = request.cardExpiryYear;
        if (request.cardFingerprint) transaction.cardFingerprint = request.cardFingerprint;
        
        // Set failure status
        transaction.status = TransactionStatus.FAILED;
        transaction.declineReason = 'system_error';
        
        await this.transactionRepository.save(transaction);
      } catch (saveError) {
        logger.error(`Failed to save error transaction: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
      }
      
      return {
        decision: 'decline',
        transactionId: request.transactionId,
        accountId: request.accountId,
        reasonCode: 'system_error',
        processingTimeMs: Date.now() - startTime
      };
    }
  }
  
  private async createTransaction(request: AuthorizationRequest): Promise<Transaction> {
    // Create new transaction record
    const transaction = new Transaction();
    
    // Handling PCI-compliant data for card transactions
    if (request.paymentMethod === 'card') {
      // If a raw card number is provided (should only come from secure input forms)
      if (request.cardNumber) {
        // Generate a payment token through tokenization if not already provided
        if (!request.paymentToken) {
          try {
            request.paymentToken = this.dataSecurityService.tokenizeCardNumber(request.cardNumber);
            
            // Derive card last 4 digits if not already provided
            if (!request.cardLast4) {
              request.cardLast4 = this.dataSecurityService.getCardLast4(request.cardNumber);
            }
            
            // Create a fingerprint for card identification without storing PAN
            if (!request.cardFingerprint && request.cardExpiryMonth && request.cardExpiryYear) {
              request.cardFingerprint = this.dataSecurityService.generateCardFingerprint(
                request.cardNumber,
                request.cardExpiryMonth,
                request.cardExpiryYear
              );
            }
          } catch (error) {
            logger.error(`Error tokenizing card: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error('Invalid card data');
          }
        }
        
        // Never store full card number in our system
        delete request.cardNumber;
      }
      
      // Never store CVV in our system
      delete request.cvv;
    }
    
    // Set the basic transaction properties
    transaction.transactionId = request.transactionId;
    transaction.accountId = request.accountId;
    transaction.amount = request.amount;
    transaction.currency = request.currency;
    transaction.merchantName = request.merchantName;
    
    // Set optional properties if available
    if (request.merchantId) transaction.merchantId = request.merchantId;
    if (request.merchantCategoryCode) transaction.merchantCategoryCode = request.merchantCategoryCode;
    if (request.location) transaction.location = request.location;
    if (request.countryCode) transaction.countryCode = request.countryCode;
    
    // Set card-related fields if available
    if (request.paymentMethod) transaction.paymentMethod = request.paymentMethod;
    if (request.paymentToken) transaction.paymentToken = request.paymentToken;
    if (request.cardBrand) transaction.cardBrand = request.cardBrand;
    if (request.cardLast4) transaction.cardLast4 = request.cardLast4;
    if (request.cardExpiryMonth) transaction.cardExpiryMonth = request.cardExpiryMonth;
    if (request.cardExpiryYear) transaction.cardExpiryYear = request.cardExpiryYear;
    if (request.cardFingerprint) transaction.cardFingerprint = request.cardFingerprint;
    
    // Set metadata if provided, but sanitize it first
    if (request.metadata) {
      transaction.metadata = this.dataSecurityService.secureSanitizeObject(request.metadata);
    }
    
    // Initial status is pending
    transaction.status = TransactionStatus.PENDING;
    
    // Save and return the transaction
    return this.transactionRepository.save(transaction);
  }
  
  private async approveTransaction(transaction: Transaction, startTime: number): Promise<AuthorizationResponse> {
    transaction.status = TransactionStatus.APPROVED;
    transaction.processedAt = new Date();
    transaction.processingTimeMs = Date.now() - startTime;
    
    await this.transactionRepository.save(transaction);
    
    logger.info(`Transaction ${transaction.transactionId} approved`, {
      transactionId: transaction.transactionId,
      processingTimeMs: transaction.processingTimeMs
    });
    
    return {
      decision: 'approve',
      transactionId: transaction.transactionId,
      accountId: transaction.accountId,
      processingTimeMs: transaction.processingTimeMs
    };
  }
  
  /**
   * Decline a transaction with the given reason code
   */
  private async declineTransaction(
    transaction: Transaction, 
    reasonCode: string, 
    startTime: number,
    ruleId?: string
  ): Promise<AuthorizationResponse> {
    // Update transaction status
    transaction.status = TransactionStatus.DECLINED;
    transaction.declineReason = reasonCode;
    transaction.processedAt = new Date();
    transaction.processingTimeMs = Date.now() - startTime;
    
    // If a specific rule ID is provided, include it in the decline reason
    if (ruleId) {
      transaction.metadata = {
        ...transaction.metadata,
        declineRuleId: ruleId
      };
    }
    
    // Save transaction
    await this.transactionRepository.save(transaction);
    
    logger.info(`Transaction ${transaction.transactionId} declined: ${reasonCode}`);
    
    // Return decline response
    return {
      decision: 'decline',
      transactionId: transaction.transactionId,
      accountId: transaction.accountId,
      reasonCode: reasonCode,
      processingTimeMs: transaction.processingTimeMs
    };
  }

  /**
   * Validates the account ID and returns the correct format if found
   * Handles various account ID formats (UUID, prefixed strings, etc.)
   */
  private async validateAccountId(accountId: string): Promise<string | null> {
    try {
      // If it's already a valid UUID, use it directly
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) {
        // Check if this UUID exists in the database
        const account = await this.accountRepository.findOne({
          where: { id: accountId }
        });
        return account ? accountId : null;
      }
      
      // If it's in another format (like acc_XXXXX), look it up by account number
      if (accountId.startsWith('acc_')) {
        const accountNumber = accountId;
        const account = await this.accountRepository.findOne({
          where: { accountNumber: accountNumber }
        });
        return account ? account.id : null;
      }
      
      // As a fallback, try to find by account number
      const account = await this.accountRepository.findOne({
        where: { accountNumber: accountId }
      });
      return account ? account.id : null;
    } catch (error) {
      logger.error(`Error validating account ID: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Create an error response when validation fails
   */
  private createErrorResponse(request: AuthorizationRequest, reasonCode: string, startTime: number): AuthorizationResponse {
    return {
      decision: 'decline',
      transactionId: request.transactionId,
      accountId: request.accountId,
      reasonCode: reasonCode,
      processingTimeMs: Date.now() - startTime
    };
  }
} 