import { getCustomersInSegment } from './shopify.js';

/**
 * Determine which customers are eligible for a discount
 * Returns array of customer IDs
 */
export async function getEligibleCustomers(shopifyClient, discountData) {
  const { client } = shopifyClient;
  
  // Parse discount configuration
  const customerSelection = discountData.customer_selection || {};
  const prerequisiteCustomerIds = customerSelection.prerequisite_customer_ids || [];
  const prerequisiteSegmentIds = customerSelection.prerequisite_saved_search_ids || [];

  // Case 1: Specific customers only
  if (prerequisiteCustomerIds.length > 0) {
    return prerequisiteCustomerIds.map(id => ({
      id: `gid://shopify/Customer/${id}`,
      email: null // Will be fetched if needed
    }));
  }

  // Case 2: Customer segments
  if (prerequisiteSegmentIds.length > 0) {
    const allCustomers = [];
    
    for (const segmentId of prerequisiteSegmentIds) {
      const gid = `gid://shopify/Segment/${segmentId}`;
      const customers = await getCustomersInSegment(client, gid);
      allCustomers.push(...customers);
    }

    // Deduplicate by customer ID
    const uniqueCustomers = Array.from(
      new Map(allCustomers.map(c => [c.id, c])).values()
    );

    return uniqueCustomers;
  }

  // Case 3: Everyone (all customers)
  // For "all customers", we return empty array as a signal
  // The metafield updater will handle this differently
  return [];
}

/**
 * Check if a discount is currently active
 */
export function isDiscountActive(discountData) {
  const now = new Date();
  const startsAt = discountData.starts_at ? new Date(discountData.starts_at) : null;
  const endsAt = discountData.ends_at ? new Date(discountData.ends_at) : null;

  // Check if within time range
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;

  // Check if enabled
  if (discountData.status !== 'enabled') return false;

  return true;
}

/**
 * Extract discount code from discount data
 */
export function getDiscountCode(discountData) {
  // For automatic discounts
  if (discountData.title && !discountData.code) {
    return discountData.title;
  }
  
  // For code-based discounts
  return discountData.code || discountData.title || 'UNKNOWN';
}

/**
 * Build eligibility map for a discount
 * Returns: { customerIds: [...], isEveryone: boolean, code: string }
 */
export async function buildEligibilityMap(shopifyClient, discountData) {
  const eligibleCustomers = await getEligibleCustomers(shopifyClient, discountData);
  const isActive = isDiscountActive(discountData);
  const code = getDiscountCode(discountData);

  if (!isActive) {
    return {
      customerIds: [],
      isEveryone: false,
      code,
      active: false
    };
  }

  // If empty array returned, it means "everyone"
  const isEveryone = eligibleCustomers.length === 0;

  return {
    customerIds: eligibleCustomers.map(c => c.id),
    isEveryone,
    code,
    active: true
  };
}
