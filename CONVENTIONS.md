# CONVENTIONS.md

Project-specific conventions for the hairhouse-shipping-functions app. Generic rules (build order, MCP toolchain, etc.) are served via the dc-mcp server - load them with `get_conventions` or read `dc-mcp://conventions`.

> **Project Type: Shopify Functions App.** This is not a theme project. All code lives in `extensions/` as standalone Shopify Function extensions compiled to WASM.

---

## JavaScript Patterns

- **Pure functions** - each extension exports a single pure function (no side effects, no async)
- **JSDoc types** - use `@typedef` imports from `../generated/api` for type safety without TypeScript
- **No external dependencies** - functions must be self-contained (Javy WASM constraint)
- **Constants at module scope** - configuration values (patterns, mappings) are defined as module-level constants
- **Early returns** - use `continue` to skip non-matching delivery options, return `NO_CHANGES` or `{ operations: [] }` for no-op cases

### Naming

- Extension directories: kebab-case (`delivery-customization`, `discount-function`)
- Source files: snake_case matching the GraphQL target (`cart_delivery_options_transform_run.js`)
- Export functions: camelCase matching the target (`cartDeliveryOptionsTransformRun`)
- Test fixtures: kebab-case describing the scenario (`hide-express-dangerous-goods.json`)

### Helper Functions

- `isRendrRate(code)` - match Rendr rates by code, not title (shared pattern across both extensions)
- `addressMatchesAny(address1, patterns)` - case-insensitive partial match against address patterns
- `hasDangerousGoods(cartLines)` - check product tags via `hasAnyTag`
- `toCents(decimalStr)` - convert Shopify decimal strings to integer cents

---

## Testing

- **Framework:** Vitest with `@shopify/shopify-function-test-helpers`
- **Pattern:** Integration tests that build the WASM and run fixtures against it
- **Fixture format:** `{ payload: { export, target, input, output } }`
- **Discovery:** All `.json` files in `tests/fixtures/` are automatically picked up
- **Naming:** Fixture files describe the scenario being tested (e.g. `rename-rendr.json`, `free-express-150.json`)
- **Build timeout:** 45 seconds for `beforeAll` (WASM compilation)
- **Test timeout:** 10 seconds per fixture run

### Adding a New Test

1. Create a `.json` file in the extension's `tests/fixtures/` directory
2. Set `payload.export` to the function's export name
3. Set `payload.target` to the Shopify function target
4. Set `payload.input` to match the GraphQL input query schema
5. Set `payload.output` to the expected function result (use `{ "operations": [] }` for no-op cases)

---

## GraphQL Input Queries

- Queries live alongside source files in `src/`
- Use Shopify's `hasAnyTag` directive for tag-based filtering (avoids fetching full tag arrays)
- Alias tag checks with descriptive names (e.g. `hasDangerousGoodsTag`, `isPlatinumMember`)
- Only request fields the function actually uses (WASM size and execution time matter)

---

## Extension Configuration

- Each extension has a `shopify.extension.toml` with:
  - `api_version` - the Shopify API version
  - `handle` - unique identifier for the extension
  - `type = "function"`
  - `targeting` - maps targets to input queries and exports
  - `build.path = "dist/function.wasm"` - compiled output location

---

## Commit Convention

Format: `type(scope): description` (lowercase type, imperative mood)

| Type | When to use |
|------|-------------|
| `feat` | New campaign or function behaviour |
| `fix` | Bug fix in function logic |
| `refactor` | Code restructuring without behaviour change |
| `test` | Adding or updating test fixtures |
| `chore` | Config, tooling, dependency updates |
| `docs` | Documentation changes |

| Scope | When to use |
|-------|-------------|
| `delivery` | `delivery-customization` extension |
| `discount` | `discount-function` extension |
| `ci` | CI/CD workflows |

Examples:
```
feat(delivery): add hide campaign for fragile goods
fix(discount): correct Rendr mapping for new price tier
test(delivery): add fixture for TAS dangerous goods scenario
chore: update Shopify API version to 2026-04
```
