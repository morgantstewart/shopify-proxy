module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { handle } = req.query;
  if (!handle) {
    return res.status(400).json({ error: 'Product handle required' });
  }

  const store = process.env.SHOPIFY_STORE_URL;
  const token = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN;

  if (!store || !token) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  try {
    const response = await fetch(`https://${store}/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token
      },
      body: JSON.stringify({
        query: 'query GetProduct($handle: String!) { productByHandle(handle: $handle) { id title handle description descriptionHtml priceRange { minVariantPrice { amount currencyCode } } featuredImage { url altText } images(first: 10) { edges { node { url altText } } } variants(first: 20) { edges { node { id title price availableForSale } } } availableForSale } }',
        variables: { handle: handle }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Shopify API error', details: data });
    }

    if (data.errors) {
      return res.status(400).json({ error: data.errors[0].message });
    }

    if (!data.data || !data.data.productByHandle) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json(data.data);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch product' });
  }
};
