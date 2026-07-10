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

1. **Rendr cost mapping** - Maps Rendr wholesale prices to Hairhouse customer prices (cart > $70, matched by rate code `brauz-rendr-delivery`). Baseline, not configurable.
2. **Free Standard Shipping for Platinum Members** - 100% off Standard Delivery for customers tagged "Platinum Member". Baseline, not configurable.
3. **Free Express Shipping** - 100% off Express Delivery at/above a configurable threshold (default $150+)
4. **Reduced Express Shipping** - Reduces Express Delivery to a configurable price at/above a configurable threshold (default $5 for orders $70+)
5. **Free Standard Shipping** - 100% off Standard Delivery at/above a configurable threshold (default $70+; `0` = no minimum)
6. **Free 3hr Rendr Delivery** - 100% off Rendr at/above a configurable threshold (default $120+). New promo, OFF by default; supersedes the cost mapping when active.

Cart thresholds use `cart.cost.totalAmount` (post product/order-level discounts) to approximate the legacy script's `ReducedCartAmountQualifier` behavior.

## Promo configuration

Campaigns 3-6 are driven by a shop metafield so the Hairhouse team can toggle promos, change spend thresholds, and schedule campaigns without a code release.

- **Metafield:** namespace `$app:promo-config`, key `settings`, type `json` (app-owned, on the shop).
- **Read path:** the discount function's input query reads `shop.metafield(...)` plus `shop.localTime.date`, so no code change is needed to adjust a promo - only the metafield value.
- **Backward compatible:** if the metafield is absent, empty, or malformed, the function falls back to the defaults above, which reproduce the previous hard-coded behaviour exactly. Each field also falls back individually, so a partial config is safe.

### Config shape

```jsonc
{
  "express": {
    "enabled": true,          // toggles the free Express promo
    "freeThreshold": 150,      // dollars; free Express at/above this
    "reducedEnabled": true,    // toggles the reduced-price Express promo
    "reducedThreshold": 70,    // dollars; reduced price applies at/above this
    "reducedPrice": 5,         // dollars; the reduced Express price
    "schedule": { "startsOn": "2026-08-01", "endsOn": "2026-08-31" }
  },
  "standard": {
    "enabled": true,
    "freeThreshold": 70,       // dollars; 0 = free with no minimum spend
    "schedule": null
  },
  "rendr": {
    "enabled": false,          // Free 3hr Rendr promo; OFF by default
    "freeThreshold": 120,
    "schedule": null
  }
}
```

- **Toggles:** set `enabled` (or `reducedEnabled`) to `false` to switch a single promo off. Other promos, the Platinum rule, and the Rendr cost mapping are unaffected.
- **Thresholds:** any non-negative number. Customer-facing messages update automatically to the configured amount.
- **Scheduling (optional):** `schedule.startsOn` / `schedule.endsOn` are `YYYY-MM-DD` (store timezone). A promo is active when today is on/after `startsOn` and on/before `endsOn`. Omit `schedule` (or set `null`) for an always-on promo. A missing or malformed bound is treated as open-ended (fail open, never hides a promo unexpectedly).
- **Legacy shape:** the original flat toggles `{ "freeExpress150": bool, "freeRendr120": bool }` are still honoured and map to `express.enabled` / `rendr.enabled`.

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
