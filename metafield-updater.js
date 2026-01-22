/**
 * Update customer metafields with eligible discount codes
 */
export async function updateCustomerMetafields(shopifyClient, eligibilityMap) {
  const { graphql } = shopifyClient;
  const { customerIds, isEveryone, code, active } = eligibilityMap;

  // If discount is inactive, we need to remove it from all customers
  if (!active) {
    return removeDiscountFromAllCustomers(graphql, code);
  }

  // If "everyone" eligible, we'll add to all customers who log in
  // For now, we skip bulk updates for "everyone" discounts
  // They'll be handled on-demand via product page load
  if (isEveryone) {
    console.log(`Discount ${code} is available to everyone - no metafield update needed`);
    return { success: true, updated: 0, skipped: 'everyone' };
  }

  // Batch update customers in groups of 25 (GraphQL mutation limit)
  const batchSize = 25;
  let totalUpdated = 0;

  for (let i = 0; i < customerIds.length; i += batchSize) {
    const batch = customerIds.slice(i, i + batchSize);
    await updateBatch(graphql, batch, code);
    totalUpdated += batch.length;
  }

  return { success: true, updated: totalUpdated };
}

/**
 * Update a batch of customers with a discount code
 */
async function updateBatch(graphql, customerIds, code) {
  // For each customer, we need to:
  // 1. Read existing metafield
  // 2. Add new code if not present
  // 3. Update metafield

  for (const customerId of customerIds) {
    try {
      // Fetch current metafield value
      const currentMetafield = await fetchCustomerMetafield(graphql, customerId);
      
      // Parse existing codes
      let codes = [];
      if (currentMetafield) {
        try {
          const parsed = JSON.parse(currentMetafield);
          codes = parsed.codes || [];
        } catch (e) {
          codes = [];
        }
      }

      // Add new code if not present
      if (!codes.includes(code)) {
        codes.push(code);
      }

      // Update metafield
      const metafieldValue = JSON.stringify({
        codes: codes,
        last_updated: new Date().toISOString()
      });

      await setCustomerMetafield(graphql, customerId, metafieldValue);
    } catch (error) {
      console.error(`Error updating customer ${customerId}:`, error.message);
      // Continue with next customer
    }
  }
}

/**
 * Fetch customer's discount eligibility metafield
 */
async function fetchCustomerMetafield(graphql, customerId) {
  const response = await graphql.request(`
    query getCustomerMetafield($customerId: ID!) {
      customer(id: $customerId) {
        metafield(namespace: "custom", key: "eligible_discounts") {
          value
        }
      }
    }
  `, {
    variables: { customerId }
  });

  return response.body.data.customer?.metafield?.value || null;
}

/**
 * Set customer's discount eligibility metafield
 */
async function setCustomerMetafield(graphql, customerId, value) {
  await graphql.request(`
    mutation setCustomerMetafield($customerId: ID!, $metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      customerId,
      metafields: [{
        ownerId: customerId,
        namespace: 'custom',
        key: 'eligible_discounts',
        value: value,
        type: 'json'
      }]
    }
  });
}

/**
 * Remove a discount code from all customers
 * Used when discount is deleted or deactivated
 */
async function removeDiscountFromAllCustomers(graphql, code) {
  // This would require querying all customers with the code in their metafield
  // For now, we'll log it and handle cleanup separately
  console.log(`Discount ${code} removed - metafield cleanup needed`);
  return { success: true, removed: 0, note: 'cleanup_pending' };
}
