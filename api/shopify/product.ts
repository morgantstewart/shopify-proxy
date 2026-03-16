/**
 * Shopify Proxy for Vercel Serverless Function
 * 
 * This file creates a proxy to avoid CORS issues when calling Shopify API from Framer
 * 
 * Setup Instructions:
 * 1. Create a new Vercel project (or use existing)
 * 2. Create folder: /api/shopify/product.ts
 * 3. Copy this code into that file
 * 4. Set environment variables in Vercel:
 *    - SHOPIFY_STORE_URL: yourstore.myshopify.com
 *    - SHOPIFY_STOREFRONT_TOKEN: your_storefront_api_token
 * 5. Deploy and use the URL in your Framer component
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

  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
  const SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

  if (!SHOPIFY_STORE_URL || !SHOPIFY_STOREFRONT_TOKEN) {
    return res.status(500).json({ 
      error: 'Shopify configuration missing. Please set SHOPIFY_STORE_URL and SHOPIFY_STOREFRONT_TOKEN environment variables.' 
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

    const response = await fetch(`https://${SHOPIFY_STORE_URL}/api/2024-01/graphql.json`, {
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
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.errors) {
      return res.status(400).json({ 
        error: data.errors[0].message,
        errors: data.errors 
      });
    }

    if (!data.data?.productByHandle) {
      return res.status(404).json({ 
        error: `Product with handle "${handle}" not found` 
      });
    }

    res.status(200).json(data.data);
  } catch (error: any) {
    console.error('Shopify proxy error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch product from Shopify' 
    });
  }
}
