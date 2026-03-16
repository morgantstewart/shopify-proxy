/**
 * Shopify Proxy for Vercel Serverless Function
 * Fixed version - no syntax errors, proper TypeScript types
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { handle } = req.query;

  if (!handle || typeof handle !== 'string') {
    return res.status(400).json({ error: 'Product handle is required' });
  }

  // Check environment variables
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

  if (!SHOPIFY_STORE_URL) {
    return res.status(500).json({ 
      error: 'SHOPIFY_STORE_URL environment variable is not set',
      details: 'Please set SHOPIFY_STORE_URL in Vercel environment variables'
    });
  }

  if (!SHOPIFY_STOREFRONT_TOKEN) {
    return res.status(500).json({ 
      error: 'SHOPIFY_STOREFRONT_TOKEN environment variable is not set',
      details: 'Please set SHOPIFY_STOREFRONT_TOKEN in Vercel environment variables'
    });
  }

  // Validate store URL format
  if (!SHOPIFY_STORE_URL.includes('.myshopify.com')) {
    return res.status(500).json({ 
      error: 'Invalid SHOPIFY_STORE_URL format',
      details: 'Store URL should be in format: yourstore.myshopify.com (no https://)',
      received: SHOPIFY_STORE_URL
    });
  }

  try {
    const query = `
      query GetProduct($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          description
          descriptionHtml
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          compareAtPriceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          featuredImage {
            url
            altText
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 20) {
            edges {
              node {
                id
                title
                price
                availableForSale
              }
            }
          }
          availableForSale
        }
      }
    `;

    const shopifyUrl = `https://${SHOPIFY_STORE_URL}/api/2024-01/graphql.json`;

    const response = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables: { handle },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `Shopify API error: ${response.status}`,
        details: errorText
      });
    }

    const data: any = await response.json();

    if (data.errors) {
      return res.status(400).json({ 
        error: data.errors[0].message,
        errors: data.errors 
      });
    }

    if (!data.data || !data.data.productByHandle) {
      return res.status(404).json({ 
        error: `Product with handle "${handle}" not found` 
      });
    }

    res.status(200).json(data.data);
  } catch (error: any) {
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch product from Shopify',
      details: error.stack || 'No additional details'
    });
  }
}
