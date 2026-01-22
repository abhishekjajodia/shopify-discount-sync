# Shopify Discount Metafield Sync

Multi-store webhook system that automatically syncs customer discount eligibility to Shopify metafields for personalized discount display on product pages.

## Overview

**Problem:** Customers don't know which discount codes they're eligible for  
**Solution:** Automatically display eligible discounts on product pages based on customer segments

**How it works:**
1. Shopify sends webhook when discount is created/updated
2. System calculates which customers are eligible (based on segments)
3. Updates customer metafields with eligible discount codes
4. Liquid template displays codes on product pages (PDP)

## Features

- ✅ **Multi-store support** - Single deployment serves unlimited stores
- ✅ **Real-time sync** - Webhook-driven, instant updates
- ✅ **Zero cost** - Runs on Vercel free tier
- ✅ **Web-based** - No terminal/CLI required
- ✅ **Secure** - Store isolation via API tokens

## Architecture

```
Shopify Webhook → Vercel Function → Shopify API → Customer Metafields → Liquid Display
```

## Quick Start

### 1. Deploy to Vercel

1. Import this repo to Vercel
2. Add environment variables (see below)
3. Deploy (automatic)

### 2. Configure Environment Variables

For each store, add these to Vercel:

```
STORE_A_SHOP=yourstore.myshopify.com
STORE_A_TOKEN=shpat_xxxxxxxxxxxxx

STORE_B_SHOP=anotherstore.myshopify.com
STORE_B_TOKEN=shpat_yyyyyyyyyyyyy
```

**Store identifier** can be anything (STORE_A, STORE_B, CLIENT1, etc.)

### 3. Create Shopify Custom App

For each store:

1. Go to: Settings → Apps and sales channels → Develop apps
2. Create custom app
3. Configure API scopes:
   - `read_customers`
   - `write_customers`
   - `read_discounts`
4. Install app
5. Copy Admin API access token → Add to Vercel env

### 4. Configure Webhooks

In Shopify Admin (Settings → Notifications → Webhooks):

Add these webhooks pointing to: `https://your-app.vercel.app/api/webhooks/discount`

- `discounts/create`
- `discounts/update`
- `discounts/delete`

**Format:** JSON

### 5. Add Liquid Code to Theme

In your product template (`product-template.liquid` or similar):

```liquid
{% if customer %}
  {% assign eligible_discounts = customer.metafields.custom.eligible_discounts %}
  {% if eligible_discounts.codes %}
    <div class="eligible-discounts">
      <h3>Your Available Discounts:</h3>
      <ul>
        {% for code in eligible_discounts.codes %}
          <li><code>{{ code }}</code></li>
        {% endfor %}
      </ul>
    </div>
  {% endif %}
{% endif %}
```

## File Structure

```
shopify-discount-sync/
├── api/
│   └── webhooks/
│       └── discount.js        # Main webhook handler
├── lib/
│   ├── shopify.js             # Shopify API client
│   ├── eligibility.js         # Eligibility logic
│   └── metafield-updater.js   # Metafield updates
├── package.json               # Dependencies
└── vercel.json                # Vercel config
```

## Metafield Structure

**Namespace:** `custom`  
**Key:** `eligible_discounts`  
**Type:** `json`

**Value:**
```json
{
  "codes": ["SUMMER20", "VIP10", "FIRSTORDER"],
  "last_updated": "2024-01-22T10:30:00Z"
}
```

## Adding New Stores

1. Add environment variables to Vercel (2 variables per store)
2. Create Shopify custom app in new store
3. Configure webhooks
4. Done! (5 minutes total)

## Monitoring

- **Vercel Dashboard:** Function logs, errors, performance
- **Shopify Admin:** Webhook delivery status
- **Customer Metafields:** Spot check via GraphQL

## Tech Stack

- **Runtime:** Node.js 18+ (Vercel serverless)
- **API:** Shopify Admin API (REST + GraphQL)
- **Dependencies:** `@shopify/shopify-api`, `node-fetch`
- **Deployment:** Vercel (auto-deploy from GitHub)

## License

MIT License - Internal use for Boco Ventures agency clients.
