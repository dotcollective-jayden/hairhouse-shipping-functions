// =============================================================
// Shopify Function: Shipping Discounts (via unified Discount Function API)
// API version: 2026-01
// Target: cart.delivery-options.discounts.generate.run
//
// Campaigns handled here (migrated from script.rb):
//   1. Rendr cost mapping — matched by rate code "brauz-rendr-delivery", cart > $70
//   2. Free Standard Shipping for Platinum Members (customer tag "Platinum Member")
//   3. Free Express Shipping for orders $150+
//   4. $5 Express Shipping for orders $70–$149
//   5. Free Standard Shipping for orders $70+
//
// *** Rendr mapping note ***
// *** Values must match Rendr's pricing spreadsheet. Last verified: 25 Feb 2025.
// *** If Rendr changes their costs, update the right-hand values in RATE_MAPPING.
// *** The map keys are what Rendr sends (in cents); values are Hairhouse price (cents).
//
// *** Cart total note ***
// *** We use cart.cost.totalAmount (post product/order-level discounts) to approximate
// *** the ReducedCartAmountQualifier behavior from the old Ruby script. This is the
// *** closest available value — Shopify Functions cannot access the applied discount
// *** code type or amount directly. totalAmount does NOT include shipping discounts
// *** (those run in parallel).
// =============================================================

import { DeliveryDiscountSelectionStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").DeliveryInput} RunInput
 * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
 */

// ---------------------------------------------------------------------------
// Rendr → Hairhouse price map (cents → cents)
// Keys: the price Rendr sends in their API response
// Values: the price Hairhouse wants to charge the customer
// If Rendr's costs change, update the values here to match their spreadsheet.
// ---------------------------------------------------------------------------
const RATE_MAPPING = {
  1099: 999,
  1237: 999,
  1374: 999,
  1512: 999,
  1649: 999,
  1787: 999,
  1924: 1139,
  2062: 1279,
  2199: 1419,
  2337: 1559,
  2474: 1699,
  2612: 1839,
  2749: 1979,
  2887: 2119,
  3024: 2259,
  3162: 2399,
  3299: 2539,
  3437: 2679,
  3574: 2819,
  3712: 2959,
  3849: 3099,
  3987: 3239,
  4124: 3379,
  4262: 3519,
  4399: 3659,
  4537: 3799,
  4674: 3939,
  4812: 4079,
  4949: 4219,
  5087: 4359,
  5224: 4499,
  5362: 4639,
  5499: 4779,
  5637: 4919,
  5774: 5059,
  5912: 5199,
  6049: 5339,
  6187: 5479,
  6324: 5619,
  6462: 5759,
  6599: 5899,
  6737: 6039,
  6874: 6179,
  7012: 6319,
  7149: 6459,
  7287: 6599,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Shopify Decimal string (e.g. "75.00") to cents as an integer.
 * Shopify returns monetary amounts as decimal strings in the GraphQL response.
 * @param {string} decimalStr
 * @returns {number}
 */
function toCents(decimalStr) {
  return Math.round(parseFloat(decimalStr) * 100);
}

/**
 * Check if a delivery option is a Rendr rate by examining its code.
 * The Ruby script matched on rate code "brauz-rendr-delivery" (case-insensitive).
 * Using the code field is more reliable than title matching since the
 * delivery-customization function may rename the title.
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
function isRendrRate(code) {
  if (!code) return false;
  return code.toLowerCase().includes("brauz-rendr-delivery");
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * @param {RunInput} input
 * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const { cart } = input;

  if (!cart.deliveryGroups.length) {
    return { operations: [] };
  }

  // Use totalAmount to approximate the post-discount subtotal.
  // This includes product/order-level discounts but not shipping discounts.
  const cartTotalDollars = parseFloat(cart.cost.totalAmount.amount);
  const isPlatinumMember =
    cart.buyerIdentity?.customer?.isPlatinumMember === true;

  const candidates = [];

  for (const group of cart.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      const title = (option.title ?? "").toLowerCase();
      const priceCents = toCents(option.cost.amount);

      // ----------------------------------------------------------------
      // Campaign 1: Rendr cost mapping (cart > $70)
      // Match by rate code (not title) for reliability.
      // Maps Rendr's wholesale cost to Hairhouse's customer-facing price
      // by applying a discount equal to the difference.
      // ----------------------------------------------------------------
      if (isRendrRate(option.code) && cartTotalDollars > 70) {
        const mappedCents = RATE_MAPPING[priceCents];
        if (mappedCents !== undefined && priceCents > mappedCents) {
          const discountCents = priceCents - mappedCents;
          candidates.push({
            message: "If ordered before 2pm, next day if after 2pm",
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: {
              fixedAmount: { amount: (discountCents / 100).toFixed(2) },
            },
          });
        }
        continue;
      }

      // ----------------------------------------------------------------
      // Campaign 2: Free Standard Shipping for Platinum Members
      // Customers with the "Platinum Member" tag get 100% off Standard
      // Delivery regardless of cart amount.
      // ----------------------------------------------------------------
      if (isPlatinumMember && title === "standard delivery") {
        candidates.push({
          message: "Platinum Free Shipping 2-6 business days",
          targets: [{ deliveryOption: { handle: option.handle } }],
          value: { percentage: { value: "100" } },
        });
        continue;
      }

      // ----------------------------------------------------------------
      // Campaign 3 & 4: Express Delivery discounts
      // $150+ → free (100% off)
      // $70–$149 → reduced to $5 (fixedAmount discount = price - $5)
      // ----------------------------------------------------------------
      if (title === "express delivery") {
        if (cartTotalDollars >= 150) {
          candidates.push({
            message: "Free Express Shipping Orders $150+",
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: { percentage: { value: "100" } },
          });
        } else if (cartTotalDollars >= 70) {
          // Set effective price to $5 by discounting the difference
          const discountCents = Math.max(0, priceCents - 500);
          candidates.push({
            message: "$5 Express Shipping for orders $70+",
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: {
              fixedAmount: { amount: (discountCents / 100).toFixed(2) },
            },
          });
        }
        continue;
      }

      // ----------------------------------------------------------------
      // Campaign 5: Free Standard Shipping for orders $70+
      // ----------------------------------------------------------------
      if (title === "standard delivery" && cartTotalDollars >= 70) {
        candidates.push({
          message: "Free Standard Shipping over $70",
          targets: [{ deliveryOption: { handle: option.handle } }],
          value: { percentage: { value: "100" } },
        });
        continue;
      }
    }
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates,
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
