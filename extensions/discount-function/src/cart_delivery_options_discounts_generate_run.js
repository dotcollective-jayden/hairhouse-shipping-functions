// =============================================================
// Shopify Function: Shipping Discounts (via unified Discount Function API)
// API version: 2026-01
// Target: cart.delivery-options.discounts.generate.run
//
// Campaigns handled here (migrated from script.rb):
//   1. Rendr cost mapping - matched by rate code "brauz-rendr-delivery", cart > $70
//   2. Free Standard Shipping for Platinum Members (customer tag "Platinum Member")
//   3. Free Express Shipping (configurable threshold, default $150+)
//   4. $5 Express Shipping (configurable, default $70-$149)
//   5. Free Standard Shipping (configurable threshold, default $70+)
//   6. Free 3hr Rendr Delivery (configurable threshold, default $120+, OFF by default)
//
// *** Configuration ***
// *** Promo toggles, thresholds and optional schedule windows are read from a
// *** shop metafield ($app:promo-config / settings, type json) at checkout.
// *** When the metafield is absent, empty, or malformed, the function falls back
// *** to DEFAULTS below - which reproduce the current live behaviour exactly, so
// *** checkout is unchanged until the team edits a promo. See README for the shape.
//
// *** Rendr mapping note ***
// *** Values must match Rendr's pricing spreadsheet. Last verified: 25 Feb 2025.
// *** If Rendr changes their costs, update the right-hand values in RATE_MAPPING.
// *** The map keys are what Rendr sends (in cents); values are Hairhouse price (cents).
//
// *** Cart total note ***
// *** We use cart.cost.totalAmount (post product/order-level discounts) to approximate
// *** the ReducedCartAmountQualifier behavior from the old Ruby script. This is the
// *** closest available value - Shopify Functions cannot access the applied discount
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
// This baseline mapping is NOT part of the configurable promos - it always
// applies (cart > $70) unless the Free 3hr Rendr promo supersedes it.
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
// Default promo configuration.
// These values reproduce the current live behaviour exactly, so a store with
// no metafield (or a malformed one) behaves identically to before this change.
// The Free 3hr Rendr promo is OFF by default - it is a new promo, and defaulting
// it off keeps the no-config path backward compatible.
// ---------------------------------------------------------------------------
const DEFAULTS = {
  express: {
    enabled: true,
    freeThreshold: 150,
    reducedEnabled: true,
    reducedThreshold: 70,
    reducedPrice: 5,
    schedule: null,
  },
  standard: {
    enabled: true,
    freeThreshold: 70,
    schedule: null,
  },
  rendr: {
    enabled: false,
    freeThreshold: 120,
    schedule: null,
  },
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

/**
 * True for a plain (non-null, non-array) object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce a value to a finite, non-negative number, or return the fallback.
 * Guards against strings, NaN, negatives and nonsense so a bad config value
 * can never remove or corrupt a discount - it just uses the default.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toNumber(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Coerce a value to a boolean, or return the fallback when it is not a boolean.
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function toBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Format a dollar amount for customer-facing messages. Number stringification
 * already drops trailing zeros (150 -> "150", 9.5 -> "9.5"), which matches the
 * legacy hard-coded message text.
 * @param {number} amount
 * @returns {string}
 */
function formatDollars(amount) {
  return String(amount);
}

/**
 * Validate an ISO calendar date string (YYYY-MM-DD). Returns the string when
 * valid, otherwise null. Kept strict so lexicographic comparison is safe.
 * @param {unknown} value
 * @returns {string | null}
 */
function toDateString(value) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Resolve a schedule object to { startsOn, endsOn } with null for any
 * missing or malformed bound.
 * @param {unknown} raw
 * @returns {{ startsOn: string | null, endsOn: string | null } | null}
 */
function resolveSchedule(raw) {
  if (!isObject(raw)) return null;
  const startsOn = toDateString(raw.startsOn);
  const endsOn = toDateString(raw.endsOn);
  if (startsOn === null && endsOn === null) return null;
  return { startsOn, endsOn };
}

/**
 * Decide whether a schedule is active for the given store-local date.
 * A missing schedule (or missing bound) is always active on that side -
 * fail open so an unconfigured or half-configured window never hides a promo.
 * Dates are ISO YYYY-MM-DD, compared lexicographically (safe for that format).
 * @param {{ startsOn: string | null, endsOn: string | null } | null} schedule
 * @param {string | null} today - store-local date, YYYY-MM-DD
 * @returns {boolean}
 */
function isScheduleActive(schedule, today) {
  if (!schedule) return true;
  if (!today) return true;
  if (schedule.startsOn && today < schedule.startsOn) return false;
  if (schedule.endsOn && today > schedule.endsOn) return false;
  return true;
}

/**
 * Merge the raw metafield JSON over DEFAULTS into a fully-populated config.
 * Every field is validated individually and falls back to its default, so a
 * partial, malformed, or entirely missing metafield is always safe.
 * The legacy flat shape ({ freeExpress150, freeRendr120 } booleans) is honoured
 * for backward compatibility with the original admin toggles.
 * @param {unknown} raw
 * @returns {typeof DEFAULTS}
 */
function resolveConfig(raw) {
  const cfg = {
    express: { ...DEFAULTS.express },
    standard: { ...DEFAULTS.standard },
    rendr: { ...DEFAULTS.rendr },
  };

  if (!isObject(raw)) return cfg;

  // Legacy flat toggles from the original admin UI.
  if (typeof raw.freeExpress150 === "boolean") {
    cfg.express.enabled = raw.freeExpress150;
  }
  if (typeof raw.freeRendr120 === "boolean") {
    cfg.rendr.enabled = raw.freeRendr120;
  }

  // Current nested shape (takes precedence over legacy flat keys).
  if (isObject(raw.express)) {
    const e = raw.express;
    cfg.express.enabled = toBoolean(e.enabled, cfg.express.enabled);
    cfg.express.freeThreshold = toNumber(e.freeThreshold, cfg.express.freeThreshold);
    cfg.express.reducedEnabled = toBoolean(e.reducedEnabled, cfg.express.reducedEnabled);
    cfg.express.reducedThreshold = toNumber(e.reducedThreshold, cfg.express.reducedThreshold);
    cfg.express.reducedPrice = toNumber(e.reducedPrice, cfg.express.reducedPrice);
    cfg.express.schedule = resolveSchedule(e.schedule);
  }

  if (isObject(raw.standard)) {
    const s = raw.standard;
    cfg.standard.enabled = toBoolean(s.enabled, cfg.standard.enabled);
    cfg.standard.freeThreshold = toNumber(s.freeThreshold, cfg.standard.freeThreshold);
    cfg.standard.schedule = resolveSchedule(s.schedule);
  }

  if (isObject(raw.rendr)) {
    const r = raw.rendr;
    cfg.rendr.enabled = toBoolean(r.enabled, cfg.rendr.enabled);
    cfg.rendr.freeThreshold = toNumber(r.freeThreshold, cfg.rendr.freeThreshold);
    cfg.rendr.schedule = resolveSchedule(r.schedule);
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * @param {RunInput} input
 * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const { cart, shop } = input;

  if (!cart.deliveryGroups.length) {
    return { operations: [] };
  }

  // Resolve promo configuration from the shop metafield (safe fallback to DEFAULTS).
  const config = resolveConfig(shop?.promoConfig?.jsonValue);
  const today = shop?.localTime?.date ?? null;

  const expressActive = isScheduleActive(config.express.schedule, today);
  const standardActive = isScheduleActive(config.standard.schedule, today);
  const rendrActive = isScheduleActive(config.rendr.schedule, today);

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
      // Rendr rates: Free 3hr promo OR baseline cost mapping (never both).
      // The Free 3hr Rendr promo (configurable, cart >= threshold) supersedes
      // the cost mapping for that option when active. Otherwise the baseline
      // cost mapping applies (cart > $70), unchanged from before.
      // ----------------------------------------------------------------
      if (isRendrRate(option.code)) {
        if (
          config.rendr.enabled &&
          rendrActive &&
          cartTotalDollars >= config.rendr.freeThreshold
        ) {
          candidates.push({
            message: `Free 3hr Delivery Orders $${formatDollars(config.rendr.freeThreshold)}+`,
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: { percentage: { value: "100" } },
          });
        } else if (cartTotalDollars > 70) {
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
        }
        continue;
      }

      // ----------------------------------------------------------------
      // Free Standard Shipping for Platinum Members
      // Customers with the "Platinum Member" tag get 100% off Standard
      // Delivery regardless of cart amount. Baseline rule - not configurable.
      // ----------------------------------------------------------------
      if (isPlatinumMember && title.includes("standard delivery")) {
        candidates.push({
          message: "Platinum Free Shipping 2-6 business days",
          targets: [{ deliveryOption: { handle: option.handle } }],
          value: { percentage: { value: "100" } },
        });
        continue;
      }

      // ----------------------------------------------------------------
      // Express Delivery discounts (configurable)
      //   free    → 100% off at/above express.freeThreshold
      //   reduced → set to express.reducedPrice at/above express.reducedThreshold
      // ----------------------------------------------------------------
      if (title.includes("express delivery")) {
        if (
          config.express.enabled &&
          expressActive &&
          cartTotalDollars >= config.express.freeThreshold
        ) {
          candidates.push({
            message: `Free Express Shipping Orders $${formatDollars(config.express.freeThreshold)}+`,
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: { percentage: { value: "100" } },
          });
        } else if (
          config.express.reducedEnabled &&
          expressActive &&
          cartTotalDollars >= config.express.reducedThreshold
        ) {
          // Set effective price to reducedPrice by discounting the difference.
          const reducedPriceCents = Math.round(config.express.reducedPrice * 100);
          const discountCents = Math.max(0, priceCents - reducedPriceCents);
          candidates.push({
            message: `$${formatDollars(config.express.reducedPrice)} Express Shipping for orders $${formatDollars(config.express.reducedThreshold)}+`,
            targets: [{ deliveryOption: { handle: option.handle } }],
            value: {
              fixedAmount: { amount: (discountCents / 100).toFixed(2) },
            },
          });
        }
        continue;
      }

      // ----------------------------------------------------------------
      // Free Standard Shipping for orders at/above standard.freeThreshold
      // (configurable). A threshold of 0 means free with no minimum spend.
      // ----------------------------------------------------------------
      if (
        title.includes("standard delivery") &&
        config.standard.enabled &&
        standardActive &&
        cartTotalDollars >= config.standard.freeThreshold
      ) {
        const message =
          config.standard.freeThreshold > 0
            ? `Free Standard Shipping over $${formatDollars(config.standard.freeThreshold)}`
            : "Free Standard Shipping";
        candidates.push({
          message,
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
