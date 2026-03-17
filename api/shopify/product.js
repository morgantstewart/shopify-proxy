// Vercel Node serverless function: /api/shopify/product
// Fetches a Shopify product by handle using the Storefront API.

/**
 * Expected environment variables (set in Vercel → Project → Settings → Environment Variables):
 *
 * We align with the existing `product-common.js` so you only need one set:
 * - SHOPIFY_STORE_URL (e.g. rj8uww-vx.myshopify.com)
 * - SHOPIFY_STOREFRONT_TOKEN (Storefront API token, not Admin)
 *
 * Backwards‑compatible aliases (optional):
 * - SHOPIFY_STORE_DOMAIN
 * - SHOPIFY_STOREFRONT_ACCESS_TOKEN
 */

// Vercel's Node runtime (Node 18+) provides a global fetch, so we don't import node-fetch.

const SHOPIFY_API_VERSION = "2024-01";

/**
 * Build the Storefront API URL.
 */
function getStorefrontEndpoint() {
  // Prefer existing envs from product-common.js
  const storeUrl =
    process.env.SHOPIFY_STORE_URL ||
    process.env.SHOPIFY_STORE_DOMAIN;

  if (!storeUrl) {
    throw new Error("SHOPIFY_STORE_URL (or SHOPIFY_STORE_DOMAIN) env var is required");
  }

  return `https://${storeUrl}/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

/**
 * Ensure required env vars are present.
 */
function assertEnv() {
  const hasStore =
    process.env.SHOPIFY_STORE_URL ||
    process.env.SHOPIFY_STORE_DOMAIN;

  const hasToken =
    process.env.SHOPIFY_STOREFRONT_TOKEN ||
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!hasStore) {
    throw new Error("Missing env: SHOPIFY_STORE_URL or SHOPIFY_STORE_DOMAIN");
  }
  if (!hasToken) {
    throw new Error("Missing env: SHOPIFY_STOREFRONT_TOKEN or SHOPIFY_STOREFRONT_ACCESS_TOKEN");
  }
}

/**
 * GraphQL query: fetch product by handle with core fields commonly needed by Framer.
 */
const PRODUCT_BY_HANDLE_QUERY = /* GraphQL */ `
  query ProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      availableForSale
      productType
      tags
      options {
        id
        name
        values
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            availableForSale
            quantityAvailable
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
          }
        }
      }
      images(first: 20) {
        edges {
          node {
            id
            altText
            url
          }
        }
      }
    }
  }
`;

/**
 * Normalize the Product object into a slightly simpler JSON payload that is
 * easy to consume from Framer / Frameship.
 */
function normalizeProduct(product) {
  if (!product) return null;

  const images =
    product.images?.edges?.map((edge) => ({
      id: edge.node.id,
      alt: edge.node.altText,
      src: edge.node.url,
    })) ?? [];

  const variants =
    product.variants?.edges?.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      sku: edge.node.sku,
      availableForSale: edge.node.availableForSale,
      quantityAvailable: edge.node.quantityAvailable,
      price: edge.node.price,
      compareAtPrice: edge.node.compareAtPrice,
      selectedOptions: edge.node.selectedOptions,
    })) ?? [];

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    descriptionHtml: product.descriptionHtml,
    availableForSale: product.availableForSale,
    productType: product.productType,
    tags: product.tags,
    options: product.options,
    images,
    variants,
  };
}

/**
 * Vercel handler.
 *
 * Examples:
 *   /api/shopify/product?handle=classic-catsuit
 *
 * Note: This repo is CommonJS (no "type": "module" in package.json), so we use
 * module.exports instead of `export default` to avoid function boot crashes on Vercel.
 */
module.exports = async function handler(req, res) {
  const startTime = Date.now();

  try {
    assertEnv();

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { handle } = req.query;

    if (!handle || typeof handle !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'handle' query param" });
    }

    const endpoint = getStorefrontEndpoint();

    const token =
      process.env.SHOPIFY_STOREFRONT_TOKEN ||
      process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({
        query: PRODUCT_BY_HANDLE_QUERY,
        variables: { handle },
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("Shopify Storefront API error", {
        status: response.status,
        statusText: response.statusText,
        body: text,
      });

      return res.status(502).json({
        error: "Bad response from Shopify Storefront API",
        status: response.status,
      });
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Shopify response JSON", e);
      return res.status(502).json({ error: "Invalid JSON from Shopify" });
    }

    if (json.errors) {
      console.error("Shopify GraphQL errors", json.errors);
      return res.status(502).json({ error: "Shopify GraphQL errors", details: json.errors });
    }

    const product = normalizeProduct(json.data?.productByHandle);

    if (!product) {
      return res.status(404).json({ error: "Product not found", handle });
    }

    const duration = Date.now() - startTime;
    console.log("Product fetched", { handle, durationMs: duration });

    return res.status(200).json({ product });
  } catch (error) {
    console.error("Unexpected error in /api/shopify/product", error);

    return res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

