import { Request, Response } from 'express';
import { AuthorizationService } from '../../services/AuthorizationService';
import logger from '../../utils/logger';

export class AuthorizationController {
  private authorizationService: AuthorizationService;
  
  constructor() {
    this.authorizationService = new AuthorizationService();
  }
  
  async authorize(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const requestData = req.body;
      
      // Validate request data
      if (!this.validateAuthorizationRequest(requestData)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid authorization request data',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Process authorization request
      const authResponse = await this.authorizationService.authorize(requestData);
      
      // Calculate total request time
      const totalTimeMs = Date.now() - startTime;
      
      // Log response time
      logger.info(`Authorization request processed in ${totalTimeMs}ms`, {
        transactionId: requestData.transactionId,
        totalTimeMs,
        processingTimeMs: authResponse.processingTimeMs,
        decision: authResponse.decision
      });
      
      // Return authorization decision
      res.status(200).json({
        status: 'success',
        data: authResponse,
        timestamp: new Date().toISOString(),
        responseTimeMs: totalTimeMs
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Authorization request error: ${errorMessage}`);
      
      // Return error response
      res.status(500).json({
        status: 'error',
        message: 'An error occurred processing the authorization request',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime
      });
    }
  }
  
  private validateAuthorizationRequest(request: any): boolean {
    // Validate required fields
    if (!request) return false;
    
    const requiredFields = ['transactionId', 'accountId', 'amount', 'currency', 'merchantName'];
    
    for (const field of requiredFields) {
      if (request[field] === undefined || request[field] === null) {
        logger.warn(`Authorization request missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate field types
    if (typeof request.transactionId !== 'string' ||
        typeof request.accountId !== 'string' ||
        typeof request.merchantName !== 'string') {
      return false;
    }
    
    // Validate amount
    const amount = parseFloat(request.amount);
    if (isNaN(amount) || amount <= 0) {
      logger.warn(`Invalid amount in authorization request: ${request.amount}`);
      return false;
    }
    
    // Validate currency
    if (typeof request.currency !== 'string' || request.currency.length !== 3) {
      logger.warn(`Invalid currency in authorization request: ${request.currency}`);
      return false;
    }
    
    // Validate payment method and token if provided
    if (request.paymentMethod === 'card') {
      // For card payments, require payment token
      if (!request.paymentToken) {
        logger.warn('Card payment method requires a payment token');
        return false;
      }
      
      // Validate card expiry if provided
      if (request.cardExpiryMonth !== undefined || request.cardExpiryYear !== undefined) {
        const expiryMonth = parseInt(String(request.cardExpiryMonth));
        const expiryYear = parseInt(String(request.cardExpiryYear));
        
        if (isNaN(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) {
          logger.warn(`Invalid card expiry month: ${request.cardExpiryMonth}`);
          return false;
        }
        
        if (isNaN(expiryYear) || expiryYear < 2000 || expiryYear > 2100) {
          logger.warn(`Invalid card expiry year: ${request.cardExpiryYear}`);
          return false;
        }
        
        // Check if card is expired
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // getMonth() is 0-indexed
        
        if ((expiryYear < currentYear) || 
           (expiryYear === currentYear && expiryMonth < currentMonth)) {
          logger.warn(`Card is expired: ${expiryMonth}/${expiryYear}`);
          return false;
        }
      }
      
      // Validate card last4 if provided
      if (request.cardLast4 && (typeof request.cardLast4 !== 'string' || 
                               !/^\d{4}$/.test(request.cardLast4))) {
        logger.warn(`Invalid card last4: ${request.cardLast4}`);
        return false;
      }
    }
    
    return true;
  }
  
  async getTransactionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      
      if (!transactionId) {
        res.status(400).json({
          status: 'error',
          message: 'Transaction ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // In a real implementation, this would fetch the transaction from the database
      // For this example, we'll return a mock response
      
      res.status(200).json({
        status: 'success',
        data: {
          transactionId,
          status: 'approved',
          processingTimeMs: 245,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Get transaction status error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred retrieving the transaction status',
        timestamp: new Date().toISOString()
      });
    }
  }
} 