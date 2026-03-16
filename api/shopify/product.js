export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  if (!SHOPIFY_STORE_URL) {
    return res.status(500).json({ 
      error: 'SHOPIFY_STORE_URL environment variable is not set'
    });
  }

  if (!SHOPIFY_STOREFRONT_TOKEN) {
    return res.status(500).json({ 
      error: 'SHOPIFY_STOREFRONT_TOKEN environment variable is not set'
    });
  }

  if (!SHOPIFY_STORE_URL.includes('.myshopify.com')) {
    return res.status(500).json({ 
      error: 'Invalid SHOPIFY_STORE_URL format'
    });
  }

  try {
    const query = `query GetProduct($handle: String!) {
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
    }`;

    const shopifyUrl = `https://${SHOPIFY_STORE_URL}/api/2024-01/graphql.json`;

    const response = await fetch(shopifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_TOKEN
      },
      body: JSON.stringify({
        query: query,
        variables: { handle: handle }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `Shopify API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();

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
  } catch (error) {
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch product from Shopify',
      details: error.stack || 'No additional details'
    });
  }
}
