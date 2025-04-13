import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Card Authorization Engine API',
      version,
      description: 'API for real-time card authorization system',
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC',
      },
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API v1',
      },
    ],
    components: {
      schemas: {
        Transaction: {
          type: 'object',
          required: ['transactionId', 'accountId', 'amount', 'currency', 'merchantName'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Transaction unique identifier',
            },
            transactionId: {
              type: 'string',
              description: 'External transaction identifier',
            },
            accountId: {
              type: 'string',
              format: 'uuid',
              description: 'Account identifier',
            },
            amount: {
              type: 'number',
              description: 'Transaction amount',
            },
            currency: {
              type: 'string',
              description: 'Transaction currency (ISO 4217)',
              example: 'USD',
            },
            merchantName: {
              type: 'string',
              description: 'Merchant name',
            },
            merchantId: {
              type: 'string',
              description: 'Merchant identifier',
            },
            merchantCategoryCode: {
              type: 'string',
              description: 'Merchant category code (MCC)',
            },
            merchantCategory: {
              type: 'string',
              description: 'Merchant category',
            },
            location: {
              type: 'string',
              description: 'Transaction location',
            },
            countryCode: {
              type: 'string',
              description: 'Country code (ISO 3166-1 alpha-2)',
            },
            status: {
              type: 'string',
              enum: ['pending', 'approved', 'declined', 'failed'],
              description: 'Transaction status',
            },
            declineReason: {
              type: 'string',
              description: 'Reason for decline (if applicable)',
            },
            paymentToken: {
              type: 'string',
              description: 'Tokenized payment instrument identifier',
            },
            paymentMethod: {
              type: 'string',
              enum: ['card', 'bank_transfer', 'wallet', 'cash', 'other'],
              description: 'Payment method used for transaction',
            },
            cardBrand: {
              type: 'string',
              description: 'Card brand (e.g., visa, mastercard)',
            },
            cardLast4: {
              type: 'string',
              description: 'Last 4 digits of card number (for display/verification)',
              pattern: '^\\d{4}$'
            },
            cardExpiryMonth: {
              type: 'integer',
              description: 'Card expiration month (1-12)',
              minimum: 1,
              maximum: 12
            },
            cardExpiryYear: {
              type: 'integer',
              description: 'Card expiration year (YYYY format)',
              minimum: 2000,
              maximum: 2100
            },
            cardFingerprint: {
              type: 'string',
              description: 'Unique identifier for the card (used for frequency analysis)'
            },
            processingTimeMs: {
              type: 'integer',
              description: 'Processing time in milliseconds',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Transaction creation timestamp',
            },
            processedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Transaction processing timestamp',
            },
          },
        },
        Rule: {
          type: 'object',
          required: ['name', 'description', 'action', 'conditions'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Rule unique identifier',
            },
            name: {
              type: 'string',
              description: 'Rule name',
            },
            description: {
              type: 'string',
              description: 'Rule description',
            },
            type: {
              type: 'string',
              enum: ['fraud_prevention', 'user_defined', 'system'],
              description: 'Rule type',
            },
            action: {
              type: 'string',
              enum: ['approve', 'decline', 'review', 'sweep'],
              description: 'Action to take when rule matches',
            },
            priority: {
              type: 'integer',
              description: 'Rule priority (lower numbers = higher priority)',
            },
            conditions: {
              type: 'object',
              description: 'Rule conditions',
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the rule is active',
            },
            accountId: {
              type: 'string',
              format: 'uuid',
              description: 'Account ID the rule belongs to (or null for global rules)',
            },
            isGlobal: {
              type: 'boolean',
              description: 'Whether the rule applies globally to all accounts',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Rule creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Rule update timestamp',
            },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Account unique identifier',
            },
            accountNumber: {
              type: 'string',
              description: 'Account number',
            },
            ownerName: {
              type: 'string',
              description: 'Account owner name',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Account owner email',
            },
            balance: {
              type: 'number',
              description: 'Account balance',
            },
            currency: {
              type: 'string',
              description: 'Account currency',
              example: 'USD',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'blocked'],
              description: 'Account status',
            },
            isSweepEnabled: {
              type: 'boolean',
              description: 'Whether fund sweeping is enabled for this account',
            },
            sweepAccountId: {
              type: 'string',
              format: 'uuid',
              description: 'Account ID to sweep funds from (if applicable)',
            },
          },
        },
        AuthorizationRequest: {
          type: 'object',
          required: ['transactionId', 'accountId', 'amount', 'currency', 'merchantName'],
          properties: {
            transactionId: {
              type: 'string',
              description: 'External transaction identifier',
            },
            accountId: {
              type: 'string',
              format: 'uuid',
              description: 'Account identifier',
            },
            amount: {
              type: 'number',
              description: 'Transaction amount',
            },
            currency: {
              type: 'string',
              description: 'Transaction currency (ISO 4217)',
              example: 'USD',
            },
            merchantName: {
              type: 'string',
              description: 'Merchant name',
            },
            merchantId: {
              type: 'string',
              description: 'Merchant identifier',
            },
            merchantCategoryCode: {
              type: 'string',
              description: 'Merchant category code (MCC)',
            },
            location: {
              type: 'string',
              description: 'Transaction location',
            },
            countryCode: {
              type: 'string',
              description: 'Country code (ISO 3166-1 alpha-2)',
            },
            paymentToken: {
              type: 'string',
              description: 'Tokenized payment instrument identifier',
            },
            paymentMethod: {
              type: 'string',
              enum: ['card', 'bank_transfer', 'wallet', 'cash', 'other'],
              description: 'Payment method used for transaction',
            },
            cardBrand: {
              type: 'string',
              description: 'Card brand (e.g., visa, mastercard)',
            },
            cardLast4: {
              type: 'string',
              description: 'Last 4 digits of card number (for display/verification)',
              pattern: '^\\d{4}$'
            },
            cardExpiryMonth: {
              type: 'integer',
              description: 'Card expiration month (1-12)',
              minimum: 1,
              maximum: 12
            },
            cardExpiryYear: {
              type: 'integer',
              description: 'Card expiration year (YYYY format)',
              minimum: 2000,
              maximum: 2100
            },
            cardFingerprint: {
              type: 'string',
              description: 'Unique identifier for the card (used for frequency analysis)'
            },
            metadata: {
              type: 'object',
              description: 'Additional transaction metadata',
            },
          },
        },
        AuthorizationResponse: {
          type: 'object',
          properties: {
            decision: {
              type: 'string',
              enum: ['approve', 'decline'],
              description: 'Authorization decision',
            },
            transactionId: {
              type: 'string',
              description: 'External transaction identifier',
            },
            accountId: {
              type: 'string',
              format: 'uuid',
              description: 'Account identifier',
            },
            reasonCode: {
              type: 'string',
              description: 'Reason code for decline (if applicable)',
            },
            processingTimeMs: {
              type: 'integer',
              description: 'Processing time in milliseconds',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error',
            },
            message: {
              type: 'string',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        NotFound: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
        ServerError: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/routes/*.ts', './src/api/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options); 