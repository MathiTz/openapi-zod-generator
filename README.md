# OpenAPI Zod Generator

A TypeScript tool that generates TypeScript types, interfaces, and Zod schemas from OpenAPI (Swagger) JSON documents.

## Features

- **Interfaces**: Generates TypeScript interfaces from OpenAPI object schemas
- **Types**: Generates type aliases with `Partial<{...}>` for all schemas
- **Zod Schemas**: Generates Zod schemas with circular reference support
- **Proper null handling**: Uses `.nullish()` for nullable fields
- **Integer support**: Uses `z.int()` for integer types

## Installation

```bash
npm install
```

## Usage

```bash
npm run generate -- <openapi-json-path>
```

### Example

```bash
npm run generate -- stripeopenapi.json
```

This will create a `generated/` folder with:

- `enums.ts` - Exported TypeScript enums
- `interfaces.ts` - Exported TypeScript interfaces + type definitions
- `schemas.ts` - Exported Zod schemas
- `types.ts` - Re-exports from interfaces and schemas

## Output Structure

### interfaces.ts
```typescript
export interface Account {
  business_profile?: AccountBusinessProfile | null;
  business_type?: string;
  capabilities: AccountCapabilities;
  charges_enabled: boolean;
  // ...
}

export type Account = Partial<{
  business_profile?: AccountBusinessProfile | null;
  business_type?: string;
  capabilities: AccountCapabilities;
  charges_enabled: boolean;
  // ...
}>;
```

### schemas.ts
```typescript
import { z } from 'zod';

export const AccountSchema = z.lazy(() => z.object({
  business_profile: z.union([z.lazy((): any => AccountBusinessProfileSchema)]).nullish(),
  business_type: z.enum(['company', 'government_entity', 'individual', 'non_profit']).nullish(),
  capabilities: z.lazy((): any => AccountCapabilitiesSchema),
  charges_enabled: z.boolean(),
  // ...
}));

export const AccountBusinessProfileSchema = z.lazy(() => z.object({
  // ...
}));
```

### types.ts
```typescript
export * from './interfaces';
export * from './schemas';
```

## Usage in Your Code

```typescript
import { AccountSchema, type Account } from './generated/schemas';
import { z } from 'zod';

// Validate data against schema
const validAccount = AccountSchema.parse({
  id: 'acct_123',
  charges_enabled: true,
});

// Infer type from schema
type InferredAccount = z.infer<typeof AccountSchema>;

// Validate and get typed result
const result = AccountSchema.safeParse(someData);
if (result.success) {
  const account: Account = result.data;
}
```

## Running Again (Updates)

Currently, running the generator will overwrite all files. To add new schemas incrementally, modify the `src/index.ts` to read existing files and merge new schemas.

## Supported OpenAPI Features

- Object schemas with properties
- Enum values
- Array types
- Nullable fields (converted to `.nullish()`)
- anyOf / allOf / oneOf compositions
- $ref references with circular support
- Common formats (date-time, email, uuid, url, etc.)
- String, number, boolean, integer primitives
- `z.lazy()` for circular references

## License

ISC
