-- Create database (run this separately if not already created)
CREATE DATABASE IF NOT EXISTS card_authorization DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE card_authorization;

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id CHAR(36) PRIMARY KEY,
  account_number VARCHAR(50) UNIQUE NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('active', 'inactive', 'blocked') NOT NULL DEFAULT 'active',
  is_sweep_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sweep_account_id CHAR(36),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(50),
  updated_by VARCHAR(50),
  -- New fields for risk profiling
  risk_score DECIMAL(5,2) DEFAULT 50.00 COMMENT 'Account risk score from 0-100, higher is riskier',
  last_risk_assessment TIMESTAMP NULL COMMENT 'When the risk score was last updated',
  usual_countries JSON COMMENT 'Array of countries where this account typically transacts',
  usual_devices JSON COMMENT 'Array of device fingerprints typically used by this account',
  usual_transaction_amount_range JSON COMMENT 'Min/max/avg transaction amounts for this account',
  usual_merchant_categories JSON COMMENT 'Merchant categories this account typically uses',
  usual_activity_hours JSON COMMENT 'Hours of day when account typically transacts',
  INDEX idx_account_number (account_number),
  INDEX idx_account_status (status),
  INDEX idx_account_risk_score (risk_score) COMMENT 'For filtering high-risk accounts'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create rules table
CREATE TABLE IF NOT EXISTS rules (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  type ENUM('fraud_prevention', 'user_defined', 'system', 'velocity', 'anomaly_detection', 'behavioral') NOT NULL DEFAULT 'user_defined',
  action ENUM('approve', 'decline', 'review', 'sweep', 'flag', 'step_up_auth') NOT NULL DEFAULT 'decline',
  priority INT NOT NULL DEFAULT 100,
  conditions JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  account_id CHAR(36),
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(50),
  updated_by VARCHAR(50),
  -- New fields for rule management
  performance_metrics JSON COMMENT 'Statistics on rule performance (match rate, false positives, etc.)',
  last_triggered TIMESTAMP NULL COMMENT 'When this rule last matched a transaction',
  trigger_count INT DEFAULT 0 COMMENT 'Number of times this rule has matched',
  version INT DEFAULT 1 COMMENT 'Rule version for tracking changes over time',
  INDEX idx_rule_name (name),
  INDEX idx_rule_account_id (account_id),
  INDEX idx_rule_global (is_global),
  INDEX idx_rule_type (type),
  INDEX idx_rule_performance (last_triggered, trigger_count),
  CONSTRAINT fk_rule_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create device fingerprints table for better fraud detection
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id CHAR(36) PRIMARY KEY,
  fingerprint_hash VARCHAR(128) NOT NULL COMMENT 'Unique hash identifying a device',
  account_id CHAR(36) COMMENT 'Account associated with this device, if any',
  ip_address VARCHAR(45),
  user_agent VARCHAR(512),
  os VARCHAR(100),
  browser VARCHAR(100),
  screen_resolution VARCHAR(20),
  timezone VARCHAR(50),
  languages VARCHAR(100),
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  risk_signals JSON COMMENT 'Detected risk signals (VPN, emulator, proxy, etc.)',
  is_trusted BOOLEAN DEFAULT FALSE,
  trust_score DECIMAL(5,2) DEFAULT 50.00,
  associated_accounts JSON COMMENT 'All accounts that have used this device',
  location_history JSON COMMENT 'Locations where this device has been used',
  INDEX idx_device_fingerprint (fingerprint_hash),
  INDEX idx_device_account (account_id),
  INDEX idx_device_trust (trust_score),
  INDEX idx_device_ip (ip_address),
  CONSTRAINT fk_device_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create transactions table with PCI compliance in mind
-- Note: We store minimal card data according to PCI-DSS requirements
-- Card numbers (PAN) are never stored, only tokenized references
CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) PRIMARY KEY,
  transaction_id VARCHAR(50) NOT NULL,
  account_id CHAR(36) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  merchant_name VARCHAR(100) NOT NULL,
  merchant_id VARCHAR(50),
  merchant_category_code VARCHAR(4),
  merchant_category VARCHAR(100),
  location VARCHAR(100),
  country_code VARCHAR(2),
  type ENUM('purchase', 'refund', 'withdrawal', 'transfer') NOT NULL DEFAULT 'purchase',
  status ENUM('pending', 'approved', 'declined', 'failed') NOT NULL DEFAULT 'pending',
  -- PCI-DSS compliant card data storage (tokenized, no PANs)
  payment_token VARCHAR(100) COMMENT 'Tokenized payment reference, never the actual PAN',
  payment_method VARCHAR(20),
  card_brand VARCHAR(20),
  card_last4 VARCHAR(4) COMMENT 'Last 4 digits only, for display purposes',
  card_expiry_month SMALLINT,
  card_expiry_year SMALLINT,
  card_fingerprint VARCHAR(100) COMMENT 'One-way hash to identify card without storing PAN',
  metadata JSON COMMENT 'Should never contain PCI data, sanitized before storage',
  enriched_data JSON COMMENT 'Should never contain PCI data, sanitized before storage',
  decline_reason VARCHAR(255),
  is_fraudulent BOOLEAN NOT NULL DEFAULT FALSE,
  fraud_score DECIMAL(5,2) DEFAULT NULL COMMENT 'Transaction fraud score from 0-100',
  applied_rules JSON,
  processing_time_ms INT NOT NULL DEFAULT 0,
  -- New fields for fraud detection
  device_fingerprint_id CHAR(36) COMMENT 'Device used for this transaction',
  ip_address VARCHAR(45) COMMENT 'IP address used for this transaction',
  user_agent VARCHAR(512) COMMENT 'Browser/app user agent',
  is_unusual BOOLEAN DEFAULT FALSE COMMENT 'Flagged as unusual for this account',
  unusual_factors JSON COMMENT 'Factors that make this transaction unusual',
  velocity_count INT DEFAULT 0 COMMENT 'Count of similar transactions in velocity window',
  auth_attempts INT DEFAULT 1 COMMENT 'Number of attempts for this transaction',
  step_up_auth_type VARCHAR(50) COMMENT 'Type of additional authentication used, if any',
  step_up_auth_status ENUM('not_required', 'pending', 'passed', 'failed') DEFAULT 'not_required',
  -- Timestamps for PCI compliance audit trail
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  purged_at TIMESTAMP NULL COMMENT 'When sensitive card data was purged',
  data_retention_checked_at TIMESTAMP NULL COMMENT 'Last time this record was checked for data retention',
  created_by VARCHAR(50),
  updated_by VARCHAR(50),
  INDEX idx_transaction_id (transaction_id),
  INDEX idx_transaction_account_id (account_id),
  INDEX idx_transaction_status (status),
  INDEX idx_transaction_created_at (created_at),
  INDEX idx_transaction_merchant_category_code (merchant_category_code),
  INDEX idx_payment_token (payment_token),
  INDEX idx_card_fingerprint (card_fingerprint),
  INDEX idx_purged_status (purged_at, payment_token) COMMENT 'For efficient data retention cleanup',
  INDEX idx_transaction_fraud (is_fraudulent, fraud_score),
  INDEX idx_transaction_device (device_fingerprint_id),
  INDEX idx_transaction_ip (ip_address),
  INDEX idx_transaction_unusual (is_unusual),
  CONSTRAINT fk_transaction_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_transaction_device FOREIGN KEY (device_fingerprint_id) REFERENCES device_fingerprints(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create velocity rules table for tracking high-frequency patterns
CREATE TABLE IF NOT EXISTS velocity_checks (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  account_id CHAR(36) COMMENT 'If null, applies globally',
  check_type ENUM('card', 'account', 'device', 'ip', 'email') NOT NULL,
  time_window_minutes INT NOT NULL DEFAULT 60,
  threshold INT NOT NULL DEFAULT 5,
  action ENUM('flag', 'decline', 'review') NOT NULL DEFAULT 'flag',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(50),
  INDEX idx_velocity_account (account_id),
  INDEX idx_velocity_type (check_type),
  INDEX idx_velocity_active (is_active),
  CONSTRAINT fk_velocity_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create an audit log table for PCI compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(50),
  action_type ENUM('insert', 'update', 'delete', 'select', 'login', 'logout', 'purge') NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id VARCHAR(50),
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action_type),
  INDEX idx_audit_table (table_name),
  INDEX idx_audit_time (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create auth attempts table to track login attempts (for PCI compliance)
CREATE TABLE IF NOT EXISTS auth_attempts (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(50),
  username VARCHAR(255),
  ip_address VARCHAR(45) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(255),
  device_fingerprint_id CHAR(36),
  failure_reason VARCHAR(100),
  INDEX idx_auth_ip (ip_address),
  INDEX idx_auth_user (user_id),
  INDEX idx_auth_time (attempted_at),
  INDEX idx_auth_device (device_fingerprint_id),
  CONSTRAINT fk_auth_device FOREIGN KEY (device_fingerprint_id) REFERENCES device_fingerprints(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create a test customer account
INSERT INTO accounts (
  id, account_number, owner_name, email, balance, currency, status, created_by,
  usual_countries, usual_transaction_amount_range, usual_merchant_categories
) 
VALUES (
  UUID(), 'CUST-TEST-001', 'Test Customer', 'customer@example.com', 5000.00, 'USD', 'active', 'system_init',
  JSON_ARRAY('US', 'CA'), 
  JSON_OBJECT('min', 10.00, 'max', 500.00, 'avg', 75.50),
  JSON_ARRAY('5411', '5732', '5812')
);

-- Create velocity check rules
INSERT INTO velocity_checks (
  id, name, check_type, time_window_minutes, threshold, action, created_by
)
VALUES 
  (UUID(), 'Multiple Card Attempts', 'card', 30, 5, 'flag', 'system_init'),
  (UUID(), 'Multiple Device Transactions', 'device', 60, 10, 'review', 'system_init'),
  (UUID(), 'Rapid Fire IP Usage', 'ip', 10, 15, 'decline', 'system_init');

-- Create a sample admin account (if accounts table is empty)
INSERT INTO accounts (
  id, account_number, owner_name, email, balance, currency, status, created_by
) 
SELECT 
  UUID(), 'ADMIN-00001', 'System Administrator', 'admin@example.com', 0, 'USD', 'active', 'system_init'
FROM dual 
WHERE NOT EXISTS (SELECT 1 FROM accounts LIMIT 1);

-- Create a sample global rule (if rules table is empty)
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
SELECT 
  UUID(), 'High Amount Transaction', 'Decline transactions over $10,000', 'system', 'decline', 10, 
  '{"amount_greater_than": 10000}', TRUE, TRUE, 'system_init'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM rules LIMIT 1);

-- Create a sample high-risk card token rule
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
SELECT 
  UUID(), 'High-Risk Card Tokens', 'Decline transactions using identified high-risk card tokens', 
  'fraud_prevention', 'decline', 5, 
  '{"card": {"highRiskTokens": ["tkn_risky123", "tkn_flagged456", "tkn_suspect789"]}}', 
  TRUE, TRUE, 'system_init'
FROM dual;

-- Create a rule for expired cards
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
SELECT 
  UUID(), 'Expired Card Check', 'Decline transactions with expired cards', 
  'fraud_prevention', 'decline', 20, 
  '{"card": {"requireValidExpiry": true}}', 
  TRUE, TRUE, 'system_init'
FROM dual;

-- Create a rule for specific card brands
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
SELECT 
  UUID(), 'Card Brand Restrictions', 'Only allow Visa and Mastercard', 
  'system', 'decline', 15, 
  '{"card": {"brands": ["visa", "mastercard"], "operator": "not"}}', 
  TRUE, TRUE, 'system_init'
FROM dual;

-- Create a rule for data retention checks
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
SELECT 
  UUID(), 'PCI Data Retention', 'Flag transactions for data purging after retention period', 
  'system', 'review', 200, 
  '{"data_retention": {"enabled": true, "days": 1}}', 
  TRUE, TRUE, 'system_init'
FROM dual;

-- Create pattern-based fraud detection rules
INSERT INTO rules (
  id, name, description, type, action, priority, conditions, is_active, is_global, created_by
)
VALUES
  (UUID(), 'Unusual Location', 'Flag transactions from countries not typically used by this account', 
   'behavioral', 'flag', 30, 
   '{"account_pattern": {"type": "unusual_country", "confidence": 0.8}}', 
   TRUE, TRUE, 'system_init'),
   
  (UUID(), 'Amount Anomaly', 'Flag transactions with amounts significantly different from account history', 
   'anomaly_detection', 'flag', 35, 
   '{"amount_anomaly": {"std_deviations": 3}}', 
   TRUE, TRUE, 'system_init'),
   
  (UUID(), 'New Device', 'Apply additional verification for transactions from new devices', 
   'behavioral', 'step_up_auth', 25, 
   '{"device": {"is_new": true}}', 
   TRUE, TRUE, 'system_init'),
   
  (UUID(), 'Time Pattern Anomaly', 'Flag transactions occurring at unusual hours for this account', 
   'behavioral', 'flag', 40, 
   '{"time_pattern": {"unusual_hour": true}}', 
   TRUE, TRUE, 'system_init'),
   
  (UUID(), 'Shopping Pattern Change', 'Flag sudden changes in shopping patterns', 
   'behavioral', 'flag', 45, 
   '{"merchant_pattern": {"category_change": true, "confidence": 0.7}}', 
   TRUE, TRUE, 'system_init');

-- Create triggers to maintain audit logs

-- Audit trigger for transaction inserts
DELIMITER $$
CREATE TRIGGER tr_transactions_insert_audit
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (id, action_type, table_name, record_id, new_values, occurred_at)
    VALUES (UUID(), 'insert', 'transactions', NEW.id, 
           JSON_OBJECT(
               'transaction_id', NEW.transaction_id, 
               'account_id', NEW.account_id, 
               'amount', NEW.amount,
               'status', NEW.status
           ),
           NOW());
END$$

-- Audit trigger for transaction updates
CREATE TRIGGER tr_transactions_update_audit
AFTER UPDATE ON transactions
FOR EACH ROW
BEGIN
    -- Only log if status changes or other important fields change
    IF NEW.status != OLD.status OR NEW.is_fraudulent != OLD.is_fraudulent OR NEW.purged_at IS NOT NULL AND OLD.purged_at IS NULL THEN
        INSERT INTO audit_log (id, action_type, table_name, record_id, old_values, new_values, occurred_at)
        VALUES (UUID(), 'update', 'transactions', NEW.id, 
               JSON_OBJECT(
                   'status', OLD.status,
                   'is_fraudulent', OLD.is_fraudulent,
                   'purged_at', OLD.purged_at
               ),
               JSON_OBJECT(
                   'status', NEW.status,
                   'is_fraudulent', NEW.is_fraudulent,
                   'purged_at', NEW.purged_at
               ),
               NOW());
    END IF;
END$$

-- Device fingerprint tracking for accounts
CREATE TRIGGER tr_transaction_device_history
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
    -- Only process if device fingerprint is provided
    IF NEW.device_fingerprint_id IS NOT NULL THEN
        -- Update last_seen timestamp for device
        UPDATE device_fingerprints 
        SET last_seen = NOW() 
        WHERE id = NEW.device_fingerprint_id;
        
        -- If device is associated with an account, update the account's device history
        IF (SELECT COUNT(*) FROM accounts WHERE id = NEW.account_id AND JSON_CONTAINS(usual_devices, CONCAT('"', NEW.device_fingerprint_id, '"'))) = 0 THEN
            UPDATE accounts
            SET usual_devices = JSON_ARRAY_APPEND(
                COALESCE(usual_devices, JSON_ARRAY()),
                '$',
                NEW.device_fingerprint_id
            )
            WHERE id = NEW.account_id;
        END IF;
    END IF;
END$$

DELIMITER ; 