import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

/**
 * Get Shopify client for a specific store
 * Reads credentials from environment variables based on store identifier
 */
export function getShopifyClient(storeIdentifier) {
  const shopDomain = process.env[`${storeIdentifier}_SHOP`];
  const accessToken = process.env[`${storeIdentifier}_TOKEN`];

  if (!shopDomain || !accessToken) {
    throw new Error(`Missing credentials for store: ${storeIdentifier}`);
  }

  const shopify = shopifyApi({
    apiKey: 'not-needed-for-custom-app',
    apiSecretKey: 'not-needed-for-custom-app',
    scopes: ['read_customers', 'write_customers', 'read_discounts'],
    hostName: shopDomain.replace('.myshopify.com', ''),
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: false,
  });

  const session = {
    shop: shopDomain,
    accessToken: accessToken,
    state: 'active',
    isOnline: false,
  };

  return {
    client: new shopify.clients.Rest({ session }),
    graphql: new shopify.clients.Graphql({ session }),
    shopDomain,
  };
}

/**
 * Identify which store a webhook is from based on shop domain
 */
export function identifyStore(shopDomain) {
  const storeKeys = Object.keys(process.env)
    .filter(key => key.endsWith('_SHOP'))
    .map(key => key.replace('_SHOP', ''));

  for (const storeKey of storeKeys) {
    if (process.env[`${storeKey}_SHOP`] === shopDomain) {
      return storeKey;
    }
  }

  throw new Error(`Unknown store: ${shopDomain}`);
}

/**
 * Fetch all customers in a specific segment
 */
export async function getCustomersInSegment(client, segmentId) {
  const customers = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await client.graphql.request(`
      query getSegmentMembers($segmentId: ID!, $cursor: String) {
        segment(id: $segmentId) {
          members(first: 250, after: $cursor) {
            edges {
              node {
                ... on Customer {
                  id
                  email
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `, {
      variables: { segmentId, cursor }
    });

    const members = response.body.data.segment.members;
    customers.push(...members.edges.map(edge => edge.node));
    
    hasNextPage = members.pageInfo.hasNextPage;
    cursor = members.pageInfo.endCursor;
  }

  return customers;
}
