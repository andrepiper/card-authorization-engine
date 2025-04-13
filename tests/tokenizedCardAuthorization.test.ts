import { expect } from 'chai';
import sinon from 'sinon';
import { AuthorizationService } from '../src/services/AuthorizationService';
import { RuleEngineService } from '../src/services/RuleEngineService';
import { TransactionStatus } from '../src/models/Transaction';
import { RuleAction } from '../src/models/Rule';

describe('Tokenized Card Authorization Tests', () => {
  let authService: AuthorizationService;
  let mockRuleEngineService: sinon.SinonStubbedInstance<RuleEngineService>;
  let mockAccountRepository: any;
  let mockTransactionRepository: any;
  let mockRuleRepository: any;
  
  beforeEach(() => {
    // Create mock repositories
    mockAccountRepository = {
      findOne: sinon.stub().resolves({
        id: 'acc-12345',
        status: 'active',
        balance: 1000,
        rules: []
      })
    };
    
    mockTransactionRepository = {
      save: sinon.stub().callsFake((transaction) => Promise.resolve(transaction))
    };
    
    mockRuleRepository = {
      find: sinon.stub().resolves([])
    };
    
    // Create mock RuleEngineService
    mockRuleEngineService = sinon.createStubInstance(RuleEngineService);
    mockRuleEngineService.evaluateRules.resolves([]);
    
    // Create AuthorizationService with mocked dependencies
    authService = new AuthorizationService();
    
    // Replace service properties with mocks
    (authService as any).accountRepository = mockAccountRepository;
    (authService as any).transactionRepository = mockTransactionRepository;
    (authService as any).ruleRepository = mockRuleRepository;
    (authService as any).ruleEngineService = mockRuleEngineService;
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  it('should successfully authorize a valid tokenized card transaction', async () => {
    // Arrange
    const request = {
      transactionId: 'tx-12345',
      accountId: 'acc-12345',
      amount: 100,
      currency: 'USD',
      merchantName: 'Test Merchant',
      paymentMethod: 'card',
      paymentToken: 'tkn_valid123',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: 12,
      cardExpiryYear: 2030,
      cardFingerprint: 'fp_abc123'
    };
    
    // Act
    const result = await authService.authorize(request);
    
    // Assert
    expect(result.decision).to.equal('approve');
    expect(result.transactionId).to.equal('tx-12345');
  });
  
  it('should decline transaction with high-risk card token', async () => {
    // Arrange
    const request = {
      transactionId: 'tx-highrisk',
      accountId: 'acc-12345',
      amount: 100,
      currency: 'USD',
      merchantName: 'Test Merchant',
      paymentMethod: 'card',
      paymentToken: 'tkn_risky123',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: 12,
      cardExpiryYear: 2030,
      cardFingerprint: 'fp_risk123'
    };
    
    // Setup rule engine to return a matching decline rule
    mockRuleEngineService.evaluateRules.resolves([{
      ruleId: 'rule-123',
      ruleName: 'High-Risk Card Token',
      action: RuleAction.DECLINE,
      matched: true,
      conditions: {
        card: {
          highRiskTokens: ['tkn_risky123']
        }
      },
      evaluationTimeMs: 5
    }]);
    
    // Act
    const result = await authService.authorize(request);
    
    // Assert
    expect(result.decision).to.equal('decline');
    expect(result.reasonCode).to.equal('rule_rule-123');
  });
  
  it('should decline transaction with expired card', async () => {
    // Arrange
    // Get current date
    const currentDate = new Date();
    const lastYear = currentDate.getFullYear() - 1;
    
    const request = {
      transactionId: 'tx-expired',
      accountId: 'acc-12345',
      amount: 100,
      currency: 'USD',
      merchantName: 'Test Merchant',
      paymentMethod: 'card',
      paymentToken: 'tkn_valid456',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: 12,
      cardExpiryYear: lastYear, // Expired card
      cardFingerprint: 'fp_expired789'
    };
    
    // Setup rule engine to return a matching decline rule for expired cards
    mockRuleEngineService.evaluateRules.resolves([{
      ruleId: 'rule-456',
      ruleName: 'Expired Card Check',
      action: RuleAction.DECLINE,
      matched: true,
      conditions: {
        card: {
          requireValidExpiry: true
        }
      },
      evaluationTimeMs: 5
    }]);
    
    // Act
    const result = await authService.authorize(request);
    
    // Assert
    expect(result.decision).to.equal('decline');
    expect(result.reasonCode).to.equal('rule_rule-456');
  });
  
  it('should decline transaction with non-approved card brand', async () => {
    // Arrange
    const request = {
      transactionId: 'tx-amex',
      accountId: 'acc-12345',
      amount: 100,
      currency: 'USD',
      merchantName: 'Test Merchant',
      paymentMethod: 'card',
      paymentToken: 'tkn_valid789',
      cardBrand: 'amex', // Not in allowed brands
      cardLast4: '9999',
      cardExpiryMonth: 12,
      cardExpiryYear: 2030,
      cardFingerprint: 'fp_amex456'
    };
    
    // Setup rule engine to return a matching decline rule for card brand
    mockRuleEngineService.evaluateRules.resolves([{
      ruleId: 'rule-789',
      ruleName: 'Card Brand Restrictions',
      action: RuleAction.DECLINE,
      matched: true,
      conditions: {
        card: {
          brands: ['visa', 'mastercard'],
          operator: 'not'
        }
      },
      evaluationTimeMs: 5
    }]);
    
    // Act
    const result = await authService.authorize(request);
    
    // Assert
    expect(result.decision).to.equal('decline');
    expect(result.reasonCode).to.equal('rule_rule-789');
  });
  
  it('should save tokenized card information in transaction record', async () => {
    // Arrange
    const request = {
      transactionId: 'tx-12345',
      accountId: 'acc-12345',
      amount: 100,
      currency: 'USD',
      merchantName: 'Test Merchant',
      paymentMethod: 'card',
      paymentToken: 'tkn_valid123',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: 12,
      cardExpiryYear: 2030,
      cardFingerprint: 'fp_abc123'
    };
    
    let savedTransaction: any = null;
    mockTransactionRepository.save = sinon.stub().callsFake((transaction) => {
      savedTransaction = transaction;
      return Promise.resolve(transaction);
    });
    
    // Act
    await authService.authorize(request);
    
    // Assert
    expect(savedTransaction).to.not.be.null;
    expect(savedTransaction.paymentToken).to.equal('tkn_valid123');
    expect(savedTransaction.paymentMethod).to.equal('card');
    expect(savedTransaction.cardBrand).to.equal('visa');
    expect(savedTransaction.cardLast4).to.equal('4242');
    expect(savedTransaction.cardExpiryMonth).to.equal(12);
    expect(savedTransaction.cardExpiryYear).to.equal(2030);
    expect(savedTransaction.cardFingerprint).to.equal('fp_abc123');
  });
}); 