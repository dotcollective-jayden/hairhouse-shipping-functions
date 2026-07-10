## [Shipping Functions Updates (#144)](https://app.productive.io/1476-dotcollective/tasks/17622665)

This is a revised scope. The originally approved scope (2026-07-01) covered only two shipping options - Free Express ($150) and Free 3hr Rendr ($120) - becoming admin-configurable and toggleable. Dana has since asked that ALL shipping options be covered, so Standard Shipping is now added. A separate request from 2026-05-11 for promo scheduling (go-live and end date-times) was never addressed and is raised again here as an open question. Both changes are the reason this scope and its estimate are larger than the original 7h.

### Needs Confirmation
- **Q: Is promo scheduling in scope for this piece of work?** The 2026-05-11 request asked for each shipping promo to have a go-live and end date-time so campaigns can be set up in advance and switch on/off automatically. This is not in the original approved scope. It adds date-time fields to the config, an admin field to set them, and time-window evaluation inside the function. Please confirm whether scheduling is included now, deferred to a later task, or dropped. (Estimated separately below so it can be added or removed cleanly.)
- **Q: Does Standard Shipping use a single configurable threshold like Express and Rendr, or the fixed preset tiers the client listed?** Express and Rendr are being set up as a single editable spend threshold plus an on/off toggle. If Standard should instead follow the specific tiers Dana listed (for example a set of fixed price bands rather than one free-over threshold), the config shape and admin surface are more involved. Please confirm the intended behaviour for Standard.
- Confirm where the config should be edited by the Hairhouse team. There is currently no admin screen for these functions - all values live in code. Options are a simple admin editing surface we build, or the team editing a documented JSON value directly in Shopify admin. This choice affects the admin portion of the estimate.
- Confirm the current live thresholds are correct to carry across as defaults: Free Express at $150, $5 Express between $70 and $149, Free Standard at $70+, Platinum free Standard, and Rendr cost mapping above $70. These become the fallback values when a promo has no override set.
- Confirm whether the Free 3hr Rendr promo at $120 is a new promo to switch on, or a change to the existing Rendr behaviour. The current function maps Rendr wholesale costs to customer prices above $70 but has no "free over $120" promo.

### Scope
- Introduce a single source of configuration for the shipping discount promos, read by the discount function at checkout, with each promo having an on/off toggle and an editable spend threshold.
- Cover all three shipping options in the configuration:
  - **Express Delivery** - toggle and editable free-shipping threshold (default: free at $150), keeping the existing reduced $5 Express behaviour.
  - **3hr Rendr Delivery** - toggle and editable threshold (default matches current live behaviour), including the Free 3hr Rendr $120 promo.
  - **Standard Delivery** - toggle and editable threshold (default: free at $70), added per Dana's request. This is the main addition over the original scope.
- Extend the function's checkout data query to read the new configuration value.
- Update the discount function so promo values come from configuration when set, and fall back to today's live values when not set, so nothing changes at checkout until the team edits a promo (backward compatible by design).
- Provide the admin editing surface confirmed above so the Hairhouse team can turn promos on/off and change thresholds without a developer or a code release.
- Preserve all existing checkout rules that are not part of this change (Platinum free Standard, Rendr PO Box / parcel locker hiding, Express hidden for dangerous goods, and the dangerous-goods Tasmania rule).
- Update the developer notes so the config, defaults, and edit process are documented for handover.

### Out of Scope
- Promo scheduling (go-live and end date-times) unless confirmed under Needs Confirmation. Estimated separately below.
- Changes to the delivery-customization function (renaming and hiding rules), except where a shared config touch is unavoidable.
- Changes to the Rendr wholesale-to-customer price mapping table itself. The mapping is maintained separately against Rendr's pricing spreadsheet.
- New shipping carriers, rates, or delivery methods beyond Express, Rendr, and Standard.
- Any storefront, Tapcart, or theme changes. This work is confined to the checkout shipping functions and their configuration.
- Customer-tag or membership logic changes beyond keeping the existing Platinum rule working.

### Acceptance Criteria
- Each of Express, Rendr, and Standard can be turned on and off independently, and their spend thresholds can be edited, without a code release.
- With no promo edited, checkout shipping discounts behave exactly as they do today (same free thresholds, same $5 Express, same Platinum and Rendr behaviour).
- Turning a promo off removes only that promo's discount at checkout and leaves the others untouched.
- Editing a threshold changes the spend level at which that promo applies at checkout.
- A malformed or missing configuration value causes the function to fall back to the current live defaults rather than erroring or removing discounts.
- All existing rules preserved: Platinum free Standard, Rendr hidden for PO Box / parcel locker, Express hidden for dangerous goods, all rates hidden for dangerous goods into Tasmania.
- If scheduling is confirmed in scope, a promo only applies within its configured go-live and end window and is inactive outside it.

### Testing Notes
- The discount function has an automated snapshot test suite driven by fixture files (cart scenarios in JSON). New fixtures will be added for each promo toggled on and off and for spend amounts just below and just above each threshold, then snapshots reviewed.
- Manual checkout testing on a development or staging store across: guest vs Platinum member, cart totals below / at / above each threshold, and each promo toggled on and off.
- Verify the backward-compatible default path by testing with no configuration set and confirming checkout matches current production behaviour.
- Verify the existing hide/rename rules still fire (PO Box, parcel locker, dangerous goods, Tasmania) as a regression check, since these share the same checkout surface.
- If scheduling is included, test a promo scheduled to start in the future (inactive now), one currently active, and one already ended (inactive).

### Estimate

| Task | Estimate |
|------|----------|
| Extend function checkout query to read config, parse with safe fallback | 1h 30m |
| Make Express configurable (toggle + threshold), keep $5 Express and $150 default | 1h 30m |
| Make Rendr configurable (toggle + threshold), incl. Free 3hr Rendr $120, keep cost mapping | 2h |
| Add Standard as a configurable option (toggle + threshold), default free at $70 | 2h |
| Define config schema (metafield) and register the definition | 1h 30m |
| Admin editing surface so the team can edit promos without a release | 4h |
| Update and add snapshot fixtures for each toggle and threshold boundary | 2h 30m |
| Manual checkout QA (member/guest, thresholds, dangerous goods) and deploy | 2h |
| Developer notes / README handover update | 1h |
| **Total (configurable thresholds - Express + Rendr + Standard)** | **18h** |
| Promo scheduling (go-live / end date-times) - config fields, admin fields, time-window evaluation | +4h (only if confirmed in scope) |

Including scheduling, the total would be 22h. The original approved estimate of 7h covered only Express and Rendr as configurable thresholds and assumed a lighter config surface; adding Standard, building the admin editing surface from scratch (there is no existing admin screen for these functions), and the backward-compatible defaults account for the increase.
