# Implementation Plan - Shipping Functions Updates (#144)

[#144 - Shipping Functions Updates](https://app.productive.io/1476-dotcollective/tasks/17622665)

Companion to `scope-144.md`. Resolves the scope's open questions in favour of customisation and flexibility.

## Resolved questions (flexibility-first)

- **Q1 Scheduling: IN SCOPE.** Date-based go-live/end windows per promo, evaluated against `shop.localTime.date` (store timezone) in JS. Time-of-day precision is not available to Shopify Functions as a dynamic value (only static query-arg helpers), so scheduling is date granularity - which matches how campaigns run.
- **Q2 Standard: single configurable threshold + toggle** (like Express/Rendr). Threshold `0` = free with no threshold, covering Dana's $0/$30/$50 examples without hard-coded tiers.
- **Q3 Config source: shop metafield `$app:promo-config` / `settings` (type `json`).** The function reads it directly (no definition required). The admin UI that writes it lives in the separate app repo; this repo owns and consumes the config contract.
- **Q4 Defaults = current live values**, so no metafield means checkout is byte-for-byte today's behaviour.
- **Q5 Free 3hr Rendr $120: new, configurable, defaults OFF** to preserve backward compatibility. Production continuity comes from the live metafield; the code default only applies when the metafield is absent.

## Config contract (`$app:promo-config` / `settings`, json)

```jsonc
{
  "express":  { "enabled": true,  "freeThreshold": 150, "reducedEnabled": true, "reducedThreshold": 70, "reducedPrice": 5, "schedule": { "startsOn": "2026-08-01", "endsOn": "2026-08-31" } },
  "standard": { "enabled": true,  "freeThreshold": 70,  "schedule": null },
  "rendr":    { "enabled": false, "freeThreshold": 120, "schedule": null }
}
```

- Every field is optional; missing/malformed fields fall back to defaults per field.
- Legacy flat shape `{ "freeExpress150": bool, "freeRendr120": bool }` is still honoured (mapped to `express.enabled` / `rendr.enabled`).
- `schedule` optional; `startsOn`/`endsOn` are `YYYY-MM-DD`. Active when `today >= startsOn` (if set) AND `today <= endsOn` (if set). Malformed bound is ignored (fail open - never removes a discount unexpectedly).

Defaults (reproduce today exactly):
Express free $150, $5 express $70-$149; Standard free $70+; Platinum free Standard (always on, not gated); Rendr cost mapping above $70 (always on, not gated); Rendr free promo OFF.

## Files to touch

| File | Action | Reason |
|------|--------|--------|
| `extensions/discount-function/src/cart_delivery_options_discounts_generate_run.graphql` | edit | Add `shop { localTime { date } metafield($app:promo-config/settings) { jsonValue } }` |
| `extensions/discount-function/src/cart_delivery_options_discounts_generate_run.js` | edit | Extract defaults + `resolveConfig()` + schedule eval; drive campaigns from config; dynamic messages; add Free Rendr promo |
| `extensions/discount-function/tests/fixtures/*.json` | create/edit | Config on/off, threshold boundaries, schedule in/out of window, legacy shape, malformed fallback |
| `README.md`, `INSTRUCTIONS.md` | edit | Document the config metafield, shape, defaults, and edit process |

## Order of changes

1. Update the input query (`.graphql`) to read shop metafield + localTime.
2. Refactor `run.js`: module-level `DEFAULTS`, `resolveConfig(rawJson)`, `isScheduleActive(schedule, today)`, `toMoney()` helpers; then rewrite the campaign loop to read resolved config and emit dynamic messages. Add the Free 3hr Rendr promo (supersedes cost mapping for that option when active).
3. Keep untouched: Platinum free Standard, Rendr cost mapping table, delivery-customization extension.
4. Update/extend fixtures. Existing fixtures must still pass unchanged (defaults == today).
5. Update docs.

## Risk flags

- **Backward compatibility** is the headline risk. Mitigation: defaults reproduce today; existing fixtures kept and must pass; malformed/missing config falls back.
- **selectionStrategy `All`**: two candidates on one option (free vs cost-map) would both apply. Mitigation: Rendr emits free XOR cost-map, never both.
- No Core Web Vitals / browser concerns (server-side function). No deploy in this task.

## Testing approach

- Toolchain-light local validation: run the pure function against every committed fixture's input and assert on expected output (the WASM/codegen build isn't wired in this env; CI runs the full vitest integration).
- Fixture matrix: each promo on/off; cart just below/at/above each threshold; schedule before/within/after window; legacy boolean config; malformed metafield -> defaults; Platinum + Rendr regression.

## Estimated complexity

**L** - config parsing, three campaigns reworked, scheduling, and a full fixture matrix. Aligns with scope's ~18h core + 4h scheduling.
