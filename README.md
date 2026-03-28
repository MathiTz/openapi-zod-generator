# OpenAPI Zod Generator

Generate TypeScript interfaces, type aliases, and Zod schemas directly from an OpenAPI (Swagger) JSON spec — no copy-paste, no drift.

## The problem

Most frontend codebases that consume a REST API end up with the same silent issue: types defined manually, schemas written separately, and nothing enforcing that they match the spec. When the API changes, the frontend breaks at runtime — not at the type-checker.

At a previous job, our team had a `/contracts` folder where this drift was constant. Engineers would update the OpenAPI spec, forget to update the Zod schemas, and validation would silently pass stale shapes into production. The fix was always manual and always fragile.

This tool was built to close that gap.

## What it does

Given an OpenAPI JSON file, it generates three artifacts into a `generated/` folder:

- `interfaces.ts` — TypeScript interfaces for all object schemas
- `schemas.ts` — Zod schemas with full circular reference support via `z.lazy()`
- `enums.ts` — TypeScript enums extracted from OpenAPI enum definitions
- `types.ts` — re-exports from interfaces and schemas as a single entry point

The generated output is production-ready. Tested against the full Stripe OpenAPI spec (one of the most complex public specs available) — works without modification.

## Usage

```bash
npm install
npm run generate -- <path-to-openapi.json>

# Example
npm run generate -- stripe-openapi.json
```

Output:

```
generated/
  enums.ts
  interfaces.ts
  schemas.ts
  types.ts
```

## Example output

**Input (OpenAPI schema fragment):**
```json
{
  "Account": {
    "type": "object",
    "properties": {
      "charges_enabled": { "type": "boolean" },
      "business_type": { 
        "type": "string",
        "enum": ["company", "individual", "non_profit"]
      }
    }
  }
}
```

**Generated interface:**
```typescript
export interface Account {
  charges_enabled: boolean;
  business_type?: 'company' | 'individual' | 'non_profit';
}
```

**Generated Zod schema:**
```typescript
export const AccountSchema = z.lazy(() => z.object({
  charges_enabled: z.boolean(),
  business_type: z.enum(['company', 'individual', 'non_profit']).nullish(),
}));
```

## Features

- TypeScript interfaces and type aliases from OpenAPI object schemas
- Zod schemas with `z.lazy()` for circular references
- `.nullish()` for nullable fields
- `z.int()` for integer types
- `anyOf` / `allOf` / `oneOf` compositions
- `$ref` resolution with circular support
- Common formats: `date-time`, `email`, `uuid`, `url`
- Enum extraction to separate file

## Roadmap

- [ ] Watch mode — regenerate on spec file changes
- [ ] Incremental generation — merge new schemas without overwriting existing files
- [ ] CLI with config file support (`openapi-zod.config.ts`)
- [ ] Support for YAML specs
- [ ] Named output directories

## Why not existing tools?

Tools like `openapi-typescript` or `zod-openapi` are excellent for greenfield setups. This was built for a specific constraint: a legacy codebase with an existing OpenAPI spec, where we needed generated artifacts that could be dropped in and adopted incrementally by different teams — without changing the API layer or introducing a new build step dependency.

## License

ISC
