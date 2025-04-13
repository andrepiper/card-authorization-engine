# Card Authorization Engine

A real-time card authorization system built in TypeScript with MySQL for persistence. This system processes card transactions, evaluates fraud and user-defined rules, and makes approve/decline decisions in real-time (under 1 second).

## Features

- **Real-Time Fraud Prevention**: Evaluates transactions against configurable risk rules
- **User-Defined Spending Controls**: Allows setting up custom spending rules
- **Just-in-Time Fund Sweeps**: Automatically transfers funds between accounts to prevent declines
- **Smart Merchant Name Matching**: Handles messy transaction data with intelligent matching
- **High Performance**: Designed for sub-second response times
- **MySQL Persistence**: Stores transaction data, accounts, and rules
- **Interactive API Documentation**: Swagger UI for exploring and testing API endpoints
- **Tokenized Credit Card Support**: Process transactions using tokenized credit card data

## Architecture

The system is built with a focus on low latency and reliability:

- **Stateless API**: Horizontal scaling for handling transaction spikes
- **Rule Engine**: Evaluates complex rule sets against transaction data
- **Enrichment Service**: Enhances transaction data with merchant information
- **Banking Integration**: Connects to banking systems for fund management
- **Fallback Mechanisms**: Graceful degradation when services are slow/unavailable

## Getting Started

### Prerequisites

- Node.js (v14+)
- MySQL (v5.7+)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/card_authorization_engine.git
   cd card_authorization_engine
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   ```
   cp .env.example .env
   ```
   Then edit the `.env` file with your database credentials and other configuration.

4. Set up the database:
   
   You have two options:
   
   **Option 1:** Use the built-in setup script (recommended):
   ```
   npm run db:setup
   ```
   
   **Option 2:** Run the SQL script manually:
   ```
   mysql -u root -p < db/mysql-schema.sql
   ```

5. Build the project:
   ```
   npm run build
   ```

6. Start the development server:
   ```
   npm run dev
   ```

7. Access the API documentation:
   ```
   http://localhost:3000/api-docs
   ```

### Database Setup

The system uses TypeORM with MySQL. The database setup process:

1. Creates a MySQL database named `card_authorization` if it doesn't exist
2. Creates the necessary tables (accounts, rules, transactions)
3. Sets up proper indexes and constraints
4. Inserts sample data if the tables are empty

## API Documentation

The API is documented using Swagger. When the application is running, you can access the interactive documentation at `/api-docs`.

This provides:
- Detailed descriptions of all endpoints
- Request/response schemas
- Interactive testing capability
- Models for all data entities

### Authorization API

- `POST /api/v1/authorization/authorize`: Process an authorization request
- `GET /api/v1/authorization/transaction/:transactionId`: Get transaction status

### Rules Management API

- `GET /api/v1/rules/account/:accountId`: Get all rules for an account
- `POST /api/v1/rules`: Create a new rule
- `GET /api/v1/rules/:ruleId`: Get a specific rule
- `PUT /api/v1/rules/:ruleId`: Update a rule
- `DELETE /api/v1/rules/:ruleId`: Delete a rule
- `PATCH /api/v1/rules/:ruleId/status`: Activate/deactivate a rule

## Performance

The system is designed to meet strict performance requirements:

- Authorization decisions in under 700ms (p99)
- Throughput of thousands of transactions per second with horizontal scaling
- Smart fallback mechanisms to ensure reliable operation

## Development

### Running Tests

```
npm test
```

### Linting

```
npm run lint
```

### Building for Production

```
npm run build
```

## Production Considerations

For production deployment:

1. Set `NODE_ENV=production` in environment variables
2. Disable TypeORM synchronization (already done in the configuration)
3. Use proper database migration strategies
4. Set up monitoring and alerts on latency, error rates, and fallback activations
5. Configure proper connection pooling for database access
6. Deploy behind a load balancer for high availability

## Troubleshooting

### Database Connection Issues

If you encounter issues with the database connection:

1. Ensure MySQL is running and accessible
2. Check the credentials in your `.env` file
3. Run the database setup script: `npm run db:setup`
4. Look for error messages in the console logs

## Tokenized Credit Card Support

The card authorization engine supports processing tokenized credit card data for enhanced security and PCI compliance. This feature allows you to:

1. Submit authorization requests with tokenized card information
2. Apply rules specifically to card characteristics
3. Identify high-risk card tokens
4. Check for card expiration
5. Restrict transactions based on card brand

### Tokenized Card Fields

The following fields support credit card processing:

| Field | Description |
|-------|-------------|
| `paymentToken` | A tokenized representation of the card, provided by your payment processor |
| `paymentMethod` | The method of payment (e.g., 'card', 'bank_transfer') |
| `cardBrand` | Card network (e.g., 'visa', 'mastercard', 'amex') |
| `cardLast4` | Last 4 digits of the card (for display and verification) |
| `cardExpiryMonth` | Card expiration month (1-12) |
| `cardExpiryYear` | Card expiration year (YYYY format) |
| `cardFingerprint` | Unique identifier for the card (used for frequency analysis) |

### Example Authorization Request

```json
{
  "transactionId": "tx-12345",
  "accountId": "acc-67890",
  "amount": 75.99,
  "currency": "USD",
  "merchantName": "Example Store",
  "merchantCategoryCode": "5411",
  "location": "San Francisco, CA",
  "countryCode": "US",
  "paymentMethod": "card",
  "paymentToken": "tkn_Wy8e7dJk2mPq5zXc",
  "cardBrand": "visa",
  "cardLast4": "4242",
  "cardExpiryMonth": 12,
  "cardExpiryYear": 2025,
  "cardFingerprint": "fp_abc123def456"
}
```

### Card-Specific Rules

The system supports rules specifically for card transactions:

```json
{
  "name": "High-Risk Card Tokens",
  "description": "Decline transactions with known high-risk tokens",
  "type": "fraud_prevention",
  "action": "decline", 
  "conditions": {
    "card": {
      "highRiskTokens": ["tkn_risky123", "tkn_flagged456"]
    }
  }
}
```

### Running the Examples

To test the tokenized card functionality, run the example script:

```
npm run build
node dist/scripts/tokenizedCardExample.js
```

This demonstrates multiple scenarios including:
- Approved tokenized card transactions
- Declined high-risk card tokens
- Declined expired cards
- Card brand restrictions

## PCI DSS Compliance

This card authorization engine implements various security measures to comply with the Payment Card Industry Data Security Standard (PCI DSS) requirements:

### Secure Storage and Handling of Card Data

1. **Tokenization**: Card numbers (PAN) are never stored directly. Instead, they are tokenized and only the token is stored in our database.

2. **Limited Data Storage**: Only the minimum required card data is stored:
   - Last 4 digits of the card number
   - Card expiration date
   - Tokenized payment reference
   - Card fingerprint (secure one-way hash)

3. **Data Retention**: Card data is automatically purged after the configurable retention period (default: 1 day)

### Network and Application Security

1. **TLS Enforcement**: All API communications are secured with TLS 1.2+ in production environments

2. **Security Headers**: Implementation of secure headers including:
   - Content Security Policy (CSP)
   - HTTP Strict Transport Security (HSTS)
   - XSS Protection
   - Referrer Policy

3. **Input Validation**: All input is validated and sanitized to prevent injection attacks

4. **Rate Limiting**: Protection against brute force and DOS attacks

### Data Encryption and Key Management

1. **Encryption**: AES-256 encryption for sensitive data

2. **Secure Key Management**: Encryption keys are stored securely and never committed to source control

### Logging and Monitoring

1. **Secure Logging**: Sensitive data is never logged, and logs are sanitized before writing

2. **Audit Trail**: All authorization requests and administrative actions are tracked

### Running the PCI Data Purge Job

To comply with PCI DSS data retention requirements, run the purge job regularly:

```bash
npm run pci:purge
```

In production, this should be set up as a scheduled task to run daily.

## License

This project is licensed under the ISC License. #
