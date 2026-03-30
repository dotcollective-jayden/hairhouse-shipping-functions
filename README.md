# Hairhouse Shipping Functions

Shopify Functions that handle shipping delivery option customization and discounts at checkout. Migrated from the legacy Shopify Script (`script.rb`).

## Extensions

### delivery-customization

**Target:** `cart.delivery-options.transform.run`

Renames and hides delivery options at checkout:

1. **Rename Rendr variants** — Renames Rendr carrier options (matched by rate code `brauz-rendr-delivery`) to "3hr Delivery"
2. **Hide Rendr for PO Box / Parcel Locker** — Hides Rendr options when the shipping address is a PO Box, parcel locker, locked box/bag, etc.
3. **Hide Express for Dangerous Goods** — Hides "Express Delivery" when any cart item is tagged "Dangerous Goods"
4. **Hide ALL rates for Dangerous Goods + restricted address/TAS** — Hides all delivery options when cart has dangerous goods and address is PO Box, parcel locker, or in Tasmania

### discount-function

**Target:** `cart.delivery-options.discounts.generate.run`

Applies shipping discount campaigns at checkout:

1. **Rendr cost mapping** — Maps Rendr wholesale prices to Hairhouse customer prices (cart > $70, matched by rate code `brauz-rendr-delivery`)
2. **Free Standard Shipping for Platinum Members** — 100% off Standard Delivery for customers tagged "Platinum Member"
3. **Free Express Shipping $150+** — 100% off Express Delivery for orders $150+
4. **$5 Express Shipping $70-$149** — Reduces Express Delivery to $5 for orders $70-$149
5. **Free Standard Shipping $70+** — 100% off Standard Delivery for orders $70+

Cart thresholds use `cart.cost.totalAmount` (post product/order-level discounts) to approximate the legacy script's `ReducedCartAmountQualifier` behavior.

## Getting started

### Requirements

1. [Node.js](https://nodejs.org/en/download/)
2. [Shopify partner account](https://partners.shopify.com/signup)
3. A [development store](https://help.shopify.com/en/partners/dashboard/development-stores#create-a-development-store) or [Shopify Plus sandbox store](https://help.shopify.com/en/partners/dashboard/managing-stores/plus-sandbox-store)

### Local development

```shell
npm run dev
```

### Running tests

```shell
# Delivery customization
cd extensions/delivery-customization && npx vitest run

# Discount function
cd extensions/discount-function && npx vitest run
```

## Rendr rate mapping

The `RATE_MAPPING` table in the discount function maps Rendr's wholesale costs (in cents) to Hairhouse's customer-facing prices. If Rendr changes their pricing, update the values in `extensions/discount-function/src/cart_delivery_options_discounts_generate_run.js`. Last verified against Rendr's pricing spreadsheet: 25 Feb 2025.

## Developer resources

- [Shopify Functions](https://shopify.dev/docs/apps/build/functions)
- [Delivery Customization API](https://shopify.dev/docs/api/functions/reference/delivery-customization)
- [Discount Function API](https://shopify.dev/docs/api/functions/reference/discount)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
