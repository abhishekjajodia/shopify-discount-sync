import { getShopifyClient, identifyStore } from '../../lib/shopify.js';
import { buildEligibilityMap } from '../../lib/eligibility.js';
import { updateCustomerMetafields } from '../../lib/metafield-updater.js';

/**
 * Main webhook handler for Shopify discount events
 * Handles: discounts/create, discounts/update, discounts/delete
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract shop domain from Shopify headers
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const topic = req.headers['x-shopify-topic'];

    if (!shopDomain) {
      return res.status(400).json({ error: 'Missing shop domain header' });
    }

    console.log(`Webhook received: ${topic} from ${shopDomain}`);

    // Identify which store this webhook is from
    const storeIdentifier = identifyStore(shopDomain);
    console.log(`Store identified: ${storeIdentifier}`);

    // Get Shopify client for this store
    const shopifyClient = getShopifyClient(storeIdentifier);

    // Parse webhook payload
    const discountData = req.body;

    // Handle different webhook topics
    if (topic === 'discounts/create' || topic === 'discounts/update') {
      await handleDiscountCreateOrUpdate(shopifyClient, discountData);
    } else if (topic === 'discounts/delete') {
      await handleDiscountDelete(shopifyClient, discountData);
    } else {
      console.log(`Unhandled topic: ${topic}`);
    }

    // Send success response
    return res.status(200).json({ 
      success: true, 
      store: storeIdentifier,
      topic: topic 
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Handle discount creation or update
 */
async function handleDiscountCreateOrUpdate(shopifyClient, discountData) {
  console.log(`Processing discount: ${discountData.title || discountData.code}`);

  // Build eligibility map (which customers get this discount)
  const eligibilityMap = await buildEligibilityMap(shopifyClient, discountData);

  console.log(`Eligibility: ${eligibilityMap.customerIds.length} customers, isEveryone: ${eligibilityMap.isEveryone}, active: ${eligibilityMap.active}`);

  // Update customer metafields
  const result = await updateCustomerMetafields(shopifyClient, eligibilityMap);

  console.log(`Update result:`, result);

  return result;
}

/**
 * Handle discount deletion
 */
async function handleDiscountDelete(shopifyClient, discountData) {
  console.log(`Deleting discount: ${discountData.title || discountData.code}`);

  // Mark discount as inactive
  const eligibilityMap = {
    customerIds: [],
    isEveryone: false,
    code: discountData.code || discountData.title,
    active: false
  };

  // This will trigger cleanup
  const result = await updateCustomerMetafields(shopifyClient, eligibilityMap);

  console.log(`Delete result:`, result);

  return result;
}
