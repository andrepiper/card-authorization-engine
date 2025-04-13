import axios from 'axios';

/**
 * This script demonstrates how to use the authorization API with tokenized credit cards
 */

// Base URL for the API
const baseUrl = 'http://localhost:3000/api/v1';

/**
 * Example function to make an authorization request with a tokenized card
 */
async function authorizeWithTokenizedCard() {
  try {
    // Sample authorization request with tokenized card data
    const authRequest = {
      transactionId: 'tx-' + Math.random().toString(36).substring(2, 10),
      accountId: 'acc-12345',
      amount: 99.95,
      currency: 'USD',
      merchantName: 'Example Store',
      merchantCategoryCode: '5411', // Grocery store
      location: 'New York, NY',
      countryCode: 'US',
      // Card-specific fields
      paymentMethod: 'card',
      paymentToken: 'tkn_Wy8e7dJk2mPq5zXc', // Token from payment processor
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: 12,
      cardExpiryYear: 2025,
      cardFingerprint: 'fp_' + Math.random().toString(36).substring(2, 10),
      // Additional metadata
      metadata: {
        deviceId: 'device-abc123',
        ipAddress: '192.168.1.1',
        browserFingerprint: 'fp-xyz789',
        isRecurring: false
      }
    };

    console.log('Making authorization request with tokenized card:');
    console.log(JSON.stringify(authRequest, null, 2));

    // Send the authorization request
    const response = await axios.post(`${baseUrl}/authorization/authorize`, authRequest);
    
    console.log('\nAuthorization response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Authorization request failed:');
    if (axios.isAxiosError(error) && error.response) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }
    throw error;
  }
}

/**
 * Example with a high-risk card token that should be declined
 */
async function authorizeWithHighRiskCard() {
  try {
    // This request uses a token that's in the high-risk list
    const authRequest = {
      transactionId: 'tx-' + Math.random().toString(36).substring(2, 10),
      accountId: 'acc-12345',
      amount: 75.50,
      currency: 'USD',
      merchantName: 'Example Store',
      merchantCategoryCode: '5411',
      location: 'New York, NY',
      countryCode: 'US',
      // Card-specific fields with high-risk token
      paymentMethod: 'card',
      paymentToken: 'tkn_risky123', // This token is in the high-risk list
      cardBrand: 'visa',
      cardLast4: '1234',
      cardExpiryMonth: 12,
      cardExpiryYear: 2025,
      cardFingerprint: 'fp_' + Math.random().toString(36).substring(2, 10)
    };

    console.log('\nMaking authorization request with high-risk card token:');
    console.log(JSON.stringify(authRequest, null, 2));

    // Send the authorization request
    const response = await axios.post(`${baseUrl}/authorization/authorize`, authRequest);
    
    console.log('\nAuthorization response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('\nAuthorization request failed:');
    if (axios.isAxiosError(error) && error.response) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }
    throw error;
  }
}

/**
 * Example with an expired card that should be declined
 */
async function authorizeWithExpiredCard() {
  try {
    // Get current date
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // Set expiry to last month
    let expiredMonth = currentMonth - 1;
    let expiredYear = currentYear;
    if (expiredMonth === 0) {
      expiredMonth = 12;
      expiredYear--;
    }
    
    // This request uses an expired card
    const authRequest = {
      transactionId: 'tx-' + Math.random().toString(36).substring(2, 10),
      accountId: 'acc-12345',
      amount: 50.00,
      currency: 'USD',
      merchantName: 'Example Store',
      merchantCategoryCode: '5411',
      location: 'New York, NY',
      countryCode: 'US',
      // Card-specific fields with expired card
      paymentMethod: 'card',
      paymentToken: 'tkn_' + Math.random().toString(36).substring(2, 10),
      cardBrand: 'visa',
      cardLast4: '4242',
      cardExpiryMonth: expiredMonth,
      cardExpiryYear: expiredYear,
      cardFingerprint: 'fp_' + Math.random().toString(36).substring(2, 10)
    };

    console.log('\nMaking authorization request with expired card:');
    console.log(JSON.stringify(authRequest, null, 2));

    // Send the authorization request
    const response = await axios.post(`${baseUrl}/authorization/authorize`, authRequest);
    
    console.log('\nAuthorization response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('\nAuthorization request failed:');
    if (axios.isAxiosError(error) && error.response) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }
    throw error;
  }
}

/**
 * Example with a non-approved card brand 
 */
async function authorizeWithRestrictedCardBrand() {
  try {
    // This request uses an American Express card which is not in the allowed list
    const authRequest = {
      transactionId: 'tx-' + Math.random().toString(36).substring(2, 10),
      accountId: 'acc-12345',
      amount: 125.75,
      currency: 'USD',
      merchantName: 'Example Store',
      merchantCategoryCode: '5411',
      location: 'New York, NY',
      countryCode: 'US',
      // Card-specific fields with non-allowed brand
      paymentMethod: 'card',
      paymentToken: 'tkn_' + Math.random().toString(36).substring(2, 10),
      cardBrand: 'amex',
      cardLast4: '9999',
      cardExpiryMonth: 12,
      cardExpiryYear: 2025,
      cardFingerprint: 'fp_' + Math.random().toString(36).substring(2, 10)
    };

    console.log('\nMaking authorization request with restricted card brand:');
    console.log(JSON.stringify(authRequest, null, 2));

    // Send the authorization request
    const response = await axios.post(`${baseUrl}/authorization/authorize`, authRequest);
    
    console.log('\nAuthorization response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('\nAuthorization request failed:');
    if (axios.isAxiosError(error) && error.response) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }
    throw error;
  }
}

// Run the examples
async function runExamples() {
  console.log('=== Tokenized Card Authorization Examples ===\n');
  
  try {
    // Example 1: Standard approved transaction
    await authorizeWithTokenizedCard();
    
    // Example 2: Declined for high-risk token
    await authorizeWithHighRiskCard();
    
    // Example 3: Declined for expired card
    await authorizeWithExpiredCard();
    
    // Example 4: Declined for restricted card brand
    await authorizeWithRestrictedCardBrand();
    
    console.log('\n=== Examples completed ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  runExamples();
}

export {
  authorizeWithTokenizedCard,
  authorizeWithHighRiskCard,
  authorizeWithExpiredCard,
  authorizeWithRestrictedCardBrand
}; 