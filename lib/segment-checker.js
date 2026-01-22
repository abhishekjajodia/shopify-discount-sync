/**
 * Segment Membership Checker
 * 
 * Checks which segments a customer belongs to and compares with their
 * current metafield to determine if updates are needed.
 */

/**
 * Fetches all active discounts with customer segment eligibility
 * @param {Object} shopify - Shopify API client
 * @returns {Promise<Array>} Array of {discountId, code, segmentIds}
 */
async function getActiveDiscountsWithSegments(shopify) {
  const query = `
    query getActiveDiscounts {
      codeDiscountNodes(first: 250) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
                status
                startsAt
                endsAt
                customerSelection {
                  ... on DiscountCustomerSegments {
                    segments {
                      id
                    }
                  }
                }
              }
              ... on DiscountCodeBxgy {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
                status
                startsAt
                endsAt
                customerSelection {
                  ... on DiscountCustomerSegments {
                    segments {
                      id
                    }
                  }
                }
              }
              ... on DiscountCodeFreeShipping {
                title
                codes(first: 1) {
                  edges {
                    node {
                      code
                    }
                  }
                }
                status
                startsAt
                endsAt
                customerSelection {
                  ... on DiscountCustomerSegments {
                    segments {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await shopify.graphql(query);
  const discounts = response.body.data?.codeDiscountNodes?.edges || [];

  const activeDiscounts = [];

  for (const edge of discounts) {
    const node = edge.node;
    const discount = node.codeDiscount;

    // Skip if no customer selection or not segment-based
    if (!discount.customerSelection?.segments) {
      continue;
    }

    // Check if discount is active
    const now = new Date();
    const startsAt = discount.startsAt ? new Date(discount.startsAt) : null;
    const endsAt = discount.endsAt ? new Date(discount.endsAt) : null;

    const isActive = discount.status === 'ACTIVE' &&
                    (!startsAt || startsAt <= now) &&
                    (!endsAt || endsAt >= now);

    if (!isActive) {
      continue;
    }

    // Get discount code
    const code = discount.codes?.edges?.[0]?.node?.code;
    if (!code) {
      continue;
    }

    // Get segment IDs
    const segmentIds = discount.customerSelection.segments.map(s => s.id);

    activeDiscounts.push({
      discountId: node.id,
      code,
      segmentIds
    });
  }

  return activeDiscounts;
}

/**
 * Checks which segments a customer is a member of
 * @param {Object} shopify - Shopify API client
 * @param {string} customerId - Customer ID (numeric or GID)
 * @param {Array<string>} segmentIds - Array of segment GIDs to check
 * @returns {Promise<Set>} Set of segment IDs the customer is a member of
 */
async function checkCustomerSegments(shopify, customerId, segmentIds) {
  if (!segmentIds || segmentIds.length === 0) {
    return new Set();
  }

  // Ensure customer ID is in GID format
  const customerGid = customerId.startsWith('gid://') 
    ? customerId 
    : `gid://shopify/Customer/${customerId}`;

  const query = `
    query checkSegmentMembership($customerId: ID!, $segmentIds: [ID!]!) {
      customerSegmentMembership(customerId: $customerId, segmentIds: $segmentIds) {
        memberships {
          segmentId
          isMember
        }
      }
    }
  `;

  const variables = {
    customerId: customerGid,
    segmentIds
  };

  const response = await shopify.graphql(query, { variables });
  const memberships = response.body.data?.customerSegmentMembership?.memberships || [];

  // Return set of segment IDs where isMember is true
  const memberSegments = new Set();
  for (const membership of memberships) {
    if (membership.isMember) {
      memberSegments.add(membership.segmentId);
    }
  }

  return memberSegments;
}

/**
 * Gets current eligible discount codes from customer metafield
 * @param {Object} shopify - Shopify API client
 * @param {string} customerId - Customer ID (numeric or GID)
 * @returns {Promise<Set>} Set of discount codes currently in metafield
 */
async function getCurrentDiscountCodes(shopify, customerId) {
  const customerGid = customerId.startsWith('gid://') 
    ? customerId 
    : `gid://shopify/Customer/${customerId}`;

  const query = `
    query getCustomerMetafield($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "custom", key: "eligible_discounts") {
          value
        }
      }
    }
  `;

  const response = await shopify.graphql(query, {
    variables: { id: customerGid }
  });

  const metafieldValue = response.body.data?.customer?.metafield?.value;
  
  if (!metafieldValue) {
    return new Set();
  }

  try {
    const data = JSON.parse(metafieldValue);
    return new Set(data.codes || []);
  } catch (error) {
    console.error('Error parsing metafield:', error);
    return new Set();
  }
}

/**
 * Main function: Check customer segment membership and update metafield if needed
 * @param {Object} shopify - Shopify API client
 * @param {string} customerId - Customer ID (numeric or GID)
 * @returns {Promise<Object>} Result with updated status and changes
 */
async function checkSegmentMembership(shopify, customerId) {
  // 1. Get all active discounts with segments
  const discounts = await getActiveDiscountsWithSegments(shopify);

  if (discounts.length === 0) {
    console.log('No active segment-based discounts found');
    return { updated: false, added: [], removed: [] };
  }

  // 2. Collect all unique segment IDs
  const allSegmentIds = new Set();
  discounts.forEach(d => {
    d.segmentIds.forEach(id => allSegmentIds.add(id));
  });

  // 3. Check which segments the customer is in
  const memberSegments = await checkCustomerSegments(shopify, customerId, Array.from(allSegmentIds));

  // 4. Determine eligible discount codes
  const eligibleCodes = new Set();
  for (const discount of discounts) {
    // Check if customer is in ANY of the discount's segments
    const isEligible = discount.segmentIds.some(segmentId => memberSegments.has(segmentId));
    if (isEligible) {
      eligibleCodes.add(discount.code);
    }
  }

  // 5. Get current discount codes from metafield
  const currentCodes = await getCurrentDiscountCodes(shopify, customerId);

  // 6. Compare and determine changes
  const added = Array.from(eligibleCodes).filter(code => !currentCodes.has(code));
  const removed = Array.from(currentCodes).filter(code => !eligibleCodes.has(code));

  // 7. Update metafield if there are changes
  if (added.length > 0 || removed.length > 0) {
    const customerGid = customerId.startsWith('gid://') 
      ? customerId 
      : `gid://shopify/Customer/${customerId}`;

    const metafieldValue = {
      codes: Array.from(eligibleCodes),
      last_updated: new Date().toISOString()
    };

    const mutation = `
      mutation updateCustomerMetafield($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: customerGid,
        metafields: [
          {
            namespace: 'custom',
            key: 'eligible_discounts',
            type: 'json',
            value: JSON.stringify(metafieldValue)
          }
        ]
      }
    };

    await shopify.graphql(mutation, { variables });

    return { updated: true, added, removed };
  }

  return { updated: false, added: [], removed: [] };
}

module.exports = {
  checkSegmentMembership,
  getActiveDiscountsWithSegments,
  checkCustomerSegments,
  getCurrentDiscountCodes
};
