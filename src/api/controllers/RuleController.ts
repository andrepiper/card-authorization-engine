import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database';
import { Rule, RuleType, RuleAction } from '../../models/Rule';
import { Account } from '../../models/Account';
import logger from '../../utils/logger';

export class RuleController {
  private ruleRepository = AppDataSource.getRepository(Rule);
  private accountRepository = AppDataSource.getRepository(Account);
  
  async getAccountRules(req: Request, res: Response): Promise<void> {
    try {
      const { accountId } = req.params;
      
      if (!accountId) {
        res.status(400).json({
          status: 'error',
          message: 'Account ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Check if account exists
      const account = await this.accountRepository.findOne({
        where: { id: accountId }
      });
      
      if (!account) {
        res.status(404).json({
          status: 'error',
          message: 'Account not found',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get account rules
      const rules = await this.ruleRepository.find({
        where: { accountId },
        order: { priority: 'ASC' }
      });
      
      res.status(200).json({
        status: 'success',
        data: rules,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Get account rules error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred retrieving account rules',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async createRule(req: Request, res: Response): Promise<void> {
    try {
      const ruleData = req.body;
      
      // Validate rule data
      if (!this.validateRuleData(ruleData)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid rule data',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Check if account exists (if accountId is provided)
      if (ruleData.accountId) {
        const account = await this.accountRepository.findOne({
          where: { id: ruleData.accountId }
        });
        
        if (!account) {
          res.status(404).json({
            status: 'error',
            message: 'Account not found',
            timestamp: new Date().toISOString()
          });
          return;
        }
      }
      
      // Create new rule
      const rule = new Rule();
      Object.assign(rule, ruleData);
      
      // Save rule
      const savedRule = await this.ruleRepository.save(rule);
      
      logger.info(`Rule created: ${savedRule.id} - ${savedRule.name}`);
      
      res.status(201).json({
        status: 'success',
        data: savedRule,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Create rule error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred creating the rule',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async getRule(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      
      if (!ruleId) {
        res.status(400).json({
          status: 'error',
          message: 'Rule ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get rule
      const rule = await this.ruleRepository.findOne({
        where: { id: ruleId }
      });
      
      if (!rule) {
        res.status(404).json({
          status: 'error',
          message: 'Rule not found',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      res.status(200).json({
        status: 'success',
        data: rule,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Get rule error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred retrieving the rule',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async updateRule(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const ruleData = req.body;
      
      if (!ruleId) {
        res.status(400).json({
          status: 'error',
          message: 'Rule ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Validate rule data
      if (!this.validateRuleData(ruleData, false)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid rule data',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get existing rule
      const rule = await this.ruleRepository.findOne({
        where: { id: ruleId }
      });
      
      if (!rule) {
        res.status(404).json({
          status: 'error',
          message: 'Rule not found',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Update rule
      Object.assign(rule, ruleData);
      
      // Save updated rule
      const updatedRule = await this.ruleRepository.save(rule);
      
      logger.info(`Rule updated: ${updatedRule.id} - ${updatedRule.name}`);
      
      res.status(200).json({
        status: 'success',
        data: updatedRule,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Update rule error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred updating the rule',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async deleteRule(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      
      if (!ruleId) {
        res.status(400).json({
          status: 'error',
          message: 'Rule ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get existing rule
      const rule = await this.ruleRepository.findOne({
        where: { id: ruleId }
      });
      
      if (!rule) {
        res.status(404).json({
          status: 'error',
          message: 'Rule not found',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Delete rule
      await this.ruleRepository.remove(rule);
      
      logger.info(`Rule deleted: ${ruleId} - ${rule.name}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Rule successfully deleted',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Delete rule error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred deleting the rule',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async updateRuleStatus(req: Request, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const { isActive } = req.body;
      
      if (!ruleId) {
        res.status(400).json({
          status: 'error',
          message: 'Rule ID is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      if (isActive === undefined || typeof isActive !== 'boolean') {
        res.status(400).json({
          status: 'error',
          message: 'isActive boolean is required',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Get existing rule
      const rule = await this.ruleRepository.findOne({
        where: { id: ruleId }
      });
      
      if (!rule) {
        res.status(404).json({
          status: 'error',
          message: 'Rule not found',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Update rule status
      rule.isActive = isActive;
      
      // Save updated rule
      const updatedRule = await this.ruleRepository.save(rule);
      
      logger.info(`Rule status updated: ${updatedRule.id} - ${updatedRule.name} - isActive: ${isActive}`);
      
      res.status(200).json({
        status: 'success',
        data: updatedRule,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Update rule status error: ${errorMessage}`);
      
      res.status(500).json({
        status: 'error',
        message: 'An error occurred updating the rule status',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  private validateRuleData(data: any, isCreating = true): boolean {
    if (!data) return false;
    
    // Required fields for creating a new rule
    if (isCreating) {
      const requiredFields = ['name', 'description', 'action', 'conditions'];
      
      for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null) {
          logger.warn(`Rule data missing required field: ${field}`);
          return false;
        }
      }
    }
    
    // Validate action if provided
    if (data.action !== undefined) {
      const validActions = Object.values(RuleAction);
      if (!validActions.includes(data.action)) {
        logger.warn(`Invalid rule action: ${data.action}`);
        return false;
      }
    }
    
    // Validate type if provided
    if (data.type !== undefined) {
      const validTypes = Object.values(RuleType);
      if (!validTypes.includes(data.type)) {
        logger.warn(`Invalid rule type: ${data.type}`);
        return false;
      }
    }
    
    // Validate conditions if provided
    if (data.conditions !== undefined) {
      if (typeof data.conditions !== 'object' || data.conditions === null) {
        logger.warn('Rule conditions must be an object');
        return false;
      }
      
      // Conditions should not be empty
      if (Object.keys(data.conditions).length === 0) {
        logger.warn('Rule conditions cannot be empty');
        return false;
      }
    }
    
    return true;
  }
} 