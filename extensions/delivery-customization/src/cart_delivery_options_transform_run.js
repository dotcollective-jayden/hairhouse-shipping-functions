// @ts-check

// =============================================================
// Shopify Function: Delivery Option Rename & Hide
// API version: 2026-01
// Target: cart.delivery-options.transform.run
//
// Operations handled here (migrated from script.rb):
//   1. Rename Rendr variants → "3hr Delivery"
//   2. Hide "3hr Delivery" for PO Box / Parcel Locker addresses
//   3. Hide Express Delivery for Dangerous Goods items
//   4. Hide ALL rates for Dangerous Goods + restricted address/TAS
// =============================================================

/**
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunInput} CartDeliveryOptionsTransformRunInput
 * @typedef {import("../generated/api").CartDeliveryOptionsTransformRunResult} CartDeliveryOptionsTransformRunResult
 */

/** @type {CartDeliveryOptionsTransformRunResult} */
const NO_CHANGES = {
  operations: [],
};

// ---------------------------------------------------------------------------
// Address patterns used by hide campaigns
// ---------------------------------------------------------------------------

// Campaign 2: Full list of PO Box / Parcel Locker / Locked Bag patterns
// that trigger hiding Rendr ("3hr Delivery") options.
const RENDR_HIDE_ADDRESS_PATTERNS = [
  "po box",
  "p.o. box",
  "post office box",
  "parcel locker",
  "parcel collect",
  "locked box",
  "locked bag",
];

// Campaign 4: Shorter list used when checking Dangerous Goods + address.
// This intentionally differs from RENDR_HIDE_ADDRESS_PATTERNS —
// it matches the Ruby script's campaign 4 (line 690) exactly.
const DANGEROUS_GOODS_HIDE_ADDRESS_PATTERNS = [
  "po box",
  "p.o. box",
  "parcel locker",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if address1 partially matches any pattern (case-insensitive).
 * @param {string | null | undefined} address1
 * @param {string[]} patterns - lowercased patterns to match against
 * @returns {boolean}
 */
function addressMatchesAny(address1, patterns) {
  if (!address1) return false;
  const lower = address1.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

/**
 * Check if a delivery option is a Rendr rate by examining its code.
 * Using the code field is more reliable than title matching since Rendr
 * could change their display names. Matches the same approach used in
 * the discount-function extension.
 * @param {string | null | undefined} code
 * @returns {boolean}
 */
function isRendrRate(code) {
  if (!code) return false;
  return code.toLowerCase().includes("brauz-rendr-delivery");
}

/**
 * Check if any cart line in the delivery group contains a product
 * tagged with "Dangerous Goods".
 * @param {Array<{merchandise: {__typename?: string, product?: {hasDangerousGoodsTag: boolean}}}>} cartLines
 * @returns {boolean}
 */
function hasDangerousGoods(cartLines) {
  return cartLines.some(
    (line) => line.merchandise?.product?.hasDangerousGoodsTag === true,
  );
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * @param {CartDeliveryOptionsTransformRunInput} input
 * @returns {CartDeliveryOptionsTransformRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const deliveryGroups = input?.cart?.deliveryGroups ?? [];
  const operations = [];

  for (const group of deliveryGroups) {
    const address1 = group.deliveryAddress?.address1 ?? null;
    const provinceCode = group.deliveryAddress?.provinceCode ?? null;
    const cartLines = group.cartLines ?? [];
    const dangerousGoods = hasDangerousGoods(cartLines);

    // Precompute address flags used by multiple campaigns
    const isRendrRestrictedAddress = addressMatchesAny(
      address1,
      RENDR_HIDE_ADDRESS_PATTERNS,
    );
    const isDangerousGoodsRestrictedAddress =
      addressMatchesAny(address1, DANGEROUS_GOODS_HIDE_ADDRESS_PATTERNS) ||
      provinceCode === "TAS";

    for (const option of group.deliveryOptions) {
      const title = option.title ?? "";
      const isRendr = isRendrRate(option.code);

      // Pre-compute which hide campaigns apply to this option.
      // Used as guards so we don't emit redundant operations
      // (e.g. renaming an option that will be hidden).
      const hideRendr = isRendr && isRendrRestrictedAddress;
      const hideAll = dangerousGoods && isDangerousGoodsRestrictedAddress;

      // ----------------------------------------------------------------
      // Campaign 1: Rename Rendr variants → "3hr Delivery"
      // Matched by rate code "brauz-rendr-delivery" for reliability.
      // Skipped if the option will be hidden by Campaign 2 or 4.
      // ----------------------------------------------------------------
      if (isRendr && !hideRendr && !hideAll) {
        operations.push({
          deliveryOptionRename: {
            deliveryOptionHandle: option.handle,
            title: "3hr Delivery",
          },
        });
      }

      // ----------------------------------------------------------------
      // Campaign 2: Hide Rendr for PO Box / Parcel Locker addresses
      // Rendr cannot deliver to PO Boxes, parcel lockers, locked bags, etc.
      // Skipped if Campaign 4 will hide all options anyway.
      // ----------------------------------------------------------------
      if (hideRendr && !hideAll) {
        operations.push({
          deliveryOptionHide: {
            deliveryOptionHandle: option.handle,
          },
        });
      }

      // ----------------------------------------------------------------
      // Campaign 3: Hide Express Delivery for Dangerous Goods
      // Products tagged "Dangerous Goods" cannot be shipped via express.
      // Skipped if Campaign 4 will hide all options anyway.
      // ----------------------------------------------------------------
      if (
        !hideAll &&
        dangerousGoods &&
        title.toLowerCase().includes("express delivery")
      ) {
        operations.push({
          deliveryOptionHide: {
            deliveryOptionHandle: option.handle,
          },
        });
      }

      // ----------------------------------------------------------------
      // Campaign 4: Hide ALL rates for Dangerous Goods + restricted address/TAS
      // If the cart has dangerous goods AND the address is PO Box, Parcel Locker,
      // or in Tasmania — hide every delivery option in this group.
      // ----------------------------------------------------------------
      if (hideAll) {
        operations.push({
          deliveryOptionHide: {
            deliveryOptionHandle: option.handle,
          },
        });
      }
    }
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
