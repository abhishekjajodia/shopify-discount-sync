/**
 * Webhook handler for customers/update events
 * 
 * When a customer is updated (order placed, tag added, address changed, etc.),
 * this checks if their segment membership has changed and updates their
 * eligible_discounts metafield accordingly.
 * 
 * Endpoint: /api/webhooks/customer
 * Webhook topics: customers/update
 */

const { identifyStore, getShopifyClient } = require('../../lib/shopify');
const { checkSegmentMembership } = require('../../lib/segment-checker');
const { updateCustomerMetafield } = require('../../lib/metafield-updater');

module.exports = async (req, res) => {
  try {
    // Verify this is a POST request
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get shop domain from webhook headers
    const shopDomain = req.headers['x-shopify-shop-domain'];
    if (!shopDomain) {
      return res.status(400).json({ error: 'Missing shop domain header' });
    }

    // Identify which store this webhook is from
    const storeId = identifyStore(shopDomain);
    if (!storeId) {
      return res.status(404).json({ error: `Store not configured: ${shopDomain}` });
    }

    // Parse customer data from webhook payload
    const customer = req.body;
    const customerId = customer.id;

    console.log(`[${storeId}] Customer ${customerId} updated, checking segment membership...`);

    // Get Shopify client for this store
    const shopify = getShopifyClient(storeId);

    // Check segment membership and update metafield if needed
    const result = await checkSegmentMembership(shopify, customerId);

    if (result.updated) {
      console.log(`[${storeId}] Customer ${customerId} metafield updated. Added: ${result.added.length}, Removed: ${result.removed.length}`);
      return res.status(200).json({
        success: true,
        message: 'Customer segment membership updated',
        added: result.added,
        removed: result.removed
      });
    } else {
      console.log(`[${storeId}] Customer ${customerId} segment membership unchanged`);
      return res.status(200).json({
        success: true,
        message: 'No changes to segment membership'
      });
    }

  } catch (error) {
    console.error('Error processing customer webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
