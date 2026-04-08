# INSTRUCTIONS.md

Developer guide for the **hairhouse-shipping-functions** Shopify app. This project contains Shopify Functions that customise delivery options and shipping discounts for Hairhouse.

---

## Architecture

This is a **Shopify Functions app** (not a theme). Functions run server-side as compiled WASM modules that intercept and transform Shopify's checkout pipeline.

```
.
├── extensions/
│   ├── delivery-customization/    # Rename & hide delivery options
│   │   ├── src/                   # Function source (JS → WASM via Javy)
│   │   ├── tests/                 # Vitest integration tests
│   │   │   └── fixtures/          # JSON test fixtures
│   │   ├── schema.graphql         # Shopify API schema
│   │   ├── shopify.extension.toml # Extension config
│   │   └── vitest.config.js
│   └── discount-function/         # Shipping discount logic
│       ├── src/
│       ├── tests/
│       │   └── fixtures/
│       ├── schema.graphql
│       ├── shopify.extension.toml
│       └── vitest.config.js
├── shopify.app.toml               # App config (scopes, webhooks)
├── package.json                   # Root workspace config
└── script.rb                      # Legacy Ruby script (reference only)
```

### Extension: `delivery-customization`

**Target:** `cart.delivery-options.transform.run`

Handles four campaigns:
1. **Rename Rendr** variants to "3hr Delivery" (matched by rate code `brauz-rendr-delivery`)
2. **Hide Rendr** for PO Box / Parcel Locker / Locked Bag addresses
3. **Hide Express Delivery** for Dangerous Goods items
4. **Hide ALL rates** for Dangerous Goods + restricted address (PO Box/Parcel Locker) or Tasmania

### Extension: `discount-function`

**Target:** `cart.delivery-options.discounts.generate.run`

Handles five campaigns:
1. **Rendr cost mapping** - maps Rendr wholesale prices to Hairhouse customer prices (cart > $70)
2. **Platinum Member** free standard shipping (customer tag "Platinum Member")
3. **Free Express** for orders $150+
4. **$5 Express** for orders $70-$149
5. **Free Standard** for orders $70+

---

## Development

### Prerequisites

- Node.js 20+
- Shopify CLI (`@shopify/cli`)
- Yarn (workspace manager)

### Commands

| Command | Purpose |
|---------|---------|
| `yarn install` | Install all dependencies (root + extensions) |
| `yarn dev` | Start local dev server (`shopify app dev`) |
| `yarn build` | Build all extensions (`shopify app build`) |
| `yarn deploy` | Deploy to Shopify (`shopify app deploy`) |

### Testing

Each extension uses Vitest with the `@shopify/shopify-function-test-helpers` package. Tests build the function to WASM, then run fixtures against it.

```bash
# Run tests for a single extension
cd extensions/delivery-customization && npx vitest run

# Run tests for all extensions
yarn workspaces run test
```

### Adding a Test Fixture

1. Create a JSON file in `extensions/<name>/tests/fixtures/`
2. Follow the structure: `{ payload: { export, target, input, output } }`
3. `input` must match the GraphQL input query schema
4. `output` is the expected function result
5. The test runner automatically discovers all `.json` files in the fixtures directory

---

## Deployment

Functions deploy via `shopify app deploy`. This compiles JS to WASM via Javy and uploads to the app's Shopify Partner dashboard.

The `shopify.app.toml` must have a valid `client_id` and `name` set before deploying.

### Required Scopes

- `write_delivery_customizations` - for the delivery transform function
- `write_discounts` - for the discount function

---

## MCP Commands

This project is configured with the dc-mcp toolchain. Available commands:

| Command | Purpose |
|---------|---------|
| `/plan` | Decompose a task into implementation steps |
| `/verify` | Pre-PR validation (build, tests) |
| `/simplify` | Code quality review of changed files |
| `/changelog` | Generate changelog handover |

Use `list_commands` or `list_skills` to discover all available commands.

---

## Key Domain Knowledge

- **Rendr** is a 3-hour delivery partner. Their rates are identified by code `brauz-rendr-delivery`, not by title (since the delivery-customization function renames them).
- **Dangerous Goods** products are identified by the `Dangerous Goods` product tag via `hasAnyTag`.
- **Platinum Members** are identified by the `Platinum Member` customer tag via `hasAnyTag`.
- The **Rendr rate mapping** (`RATE_MAPPING` in discount-function) must match Rendr's pricing spreadsheet. If Rendr changes their costs, only the map values need updating.
- `cart.cost.totalAmount` is used as an approximation of the post-discount subtotal. It includes product/order-level discounts but not shipping discounts.
- The `script.rb` file in the project root is the **legacy Ruby script** these functions were migrated from. It serves as a reference only.
