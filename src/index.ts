import * as fs from 'fs';
import * as path from 'path';

interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  enum?: (string | number)[];
  $ref?: string;
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  nullable?: boolean;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
}

interface OpenAPIComponents {
  schemas?: Record<string, OpenAPISchema>;
}

interface OpenAPIDocument {
  components?: OpenAPIComponents;
}

const OUTPUT_DIR = 'generated';

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(capitalizeFirst)
    .join('');
}

function sanitizeIdentifier(str: string): string {
  return toPascalCase(str.replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function getTypeName(ref: string): string {
  const parts = ref.split('/');
  const name = parts[parts.length - 1];
  return sanitizeIdentifier(name);
}

function getTypeFromSchema(schema: OpenAPISchema, definedSchemas: Set<string>): string {
  if (schema.$ref) {
    const typeName = getTypeName(schema.$ref);
    return definedSchemas.has(typeName) ? typeName : 'unknown';
  }

  if (schema.anyOf || schema.allOf || schema.oneOf) {
    const schemas = schema.anyOf || schema.allOf || schema.oneOf || [];
    const types = schemas
      .map((s) => getTypeFromSchema(s, definedSchemas))
      .filter((t) => t !== 'unknown');
    if (schema.nullable) types.push('null');
    return types.length > 0 ? types.join(' | ') : 'unknown';
  }

  if (schema.type === 'string') {
    if (schema.enum) {
      return 'string';
    }
    if (schema.format === 'date-time') {
      return 'string';
    }
    if (schema.format === 'date') {
      return 'string';
    }
    if (schema.format === 'email') {
      return 'string';
    }
    if (schema.format === 'uri' || schema.format === 'url') {
      return 'string';
    }
    if (schema.format === 'uuid') {
      return 'string';
    }
    if (schema.format === 'unix-time') {
      return 'number';
    }
    return 'string';
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  }

  if (schema.type === 'boolean') {
    return 'boolean';
  }

  if (schema.type === 'array') {
    if (schema.items) {
      return `${getTypeFromSchema(schema.items, definedSchemas)}[]`;
    }
    return 'unknown[]';
  }

  if (schema.type === 'object') {
    return 'Record<string, unknown>';
  }

  if (schema.enum) {
    return 'string';
  }

  return 'unknown';
}

function generateEnum(schema: OpenAPISchema): string {
  if (!schema.enum) return '';
  const values = schema.enum.map((v) => `'${v}'`).join(', ');
  return `(${values})`;
}

function generateInterface(
  name: string,
  schema: OpenAPISchema,
  definedSchemas: Set<string>
): string {
  const lines: string[] = [];
  lines.push(`export interface ${name} {`);

  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const typeName = getTypeFromSchema(propSchema, definedSchemas);
      const optional = propSchema.nullable ? '?' : '';
      lines.push(`  ${propName}${optional}: ${typeName};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generateZodSchema(
  name: string,
  schema: OpenAPISchema,
  definedSchemas: Set<string>,
  generatedSchemas: Map<string, string>
): string {
  if (schema.$ref) {
    const typeName = getTypeName(schema.$ref);
    return `z.lazy((): any => ${typeName}Schema)`;
  }

  if (schema.anyOf || schema.allOf || schema.oneOf) {
    const schemas = schema.anyOf || schema.allOf || schema.oneOf || [];
    const zodSchemas = schemas
      .map((s) => generateZodSchema(name, s, definedSchemas, generatedSchemas))
      .filter((s) => s !== 'z.unknown()');
    const method = schema.anyOf ? 'union' : schema.allOf ? 'intersect' : 'union';
    if (zodSchemas.length === 0) return 'z.unknown()';
    if (schema.nullable) {
      return `z.${method}([${zodSchemas.join(', ')}]).nullish()`;
    }
    return `z.${method}([${zodSchemas.join(', ')}])`;
  }

  if (schema.type === 'string') {
    let zod = 'z.string()';
    if (schema.enum) {
      const values = schema.enum.map((v) => `'${v}'`).join(', ');
      zod = `z.enum([${values}])`;
    }
    if (schema.format === 'date-time') {
      zod = 'z.string().datetime()';
    }
    if (schema.format === 'date') {
      zod = 'z.string().date()';
    }
    if (schema.format === 'email') {
      zod = 'z.string().email()';
    }
    if (schema.format === 'uri' || schema.format === 'url') {
      zod = 'z.string().url()';
    }
    if (schema.format === 'uuid') {
      zod = 'z.string().uuid()';
    }
    if (schema.minLength) {
      zod += `.min(${schema.minLength})`;
    }
    if (schema.maxLength) {
      zod += `.max(${schema.maxLength})`;
    }
    if (schema.pattern) {
      let escapedPattern = schema.pattern;
      if (!escapedPattern.startsWith('^')) {
        escapedPattern = '^' + escapedPattern;
      }
      if (!escapedPattern.endsWith('$')) {
        escapedPattern = escapedPattern + '$';
      }
      escapedPattern = escapedPattern
        .replace(/\\/g, '\\\\')
        .replace(/\//g, '\\/');
      zod += `.regex(/${escapedPattern}/)`;
    }
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.type === 'integer') {
    let zod = 'z.int()';
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.type === 'number') {
    let zod = 'z.number()';
    if (schema.minimum !== undefined) {
      zod += `.min(${schema.minimum})`;
    }
    if (schema.maximum !== undefined) {
      zod += `.max(${schema.maximum})`;
    }
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.type === 'boolean') {
    let zod = 'z.boolean()';
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.type === 'array' && schema.items) {
    const itemSchema = generateZodSchema(name, schema.items, definedSchemas, generatedSchemas);
    let zod = `z.array(${itemSchema})`;
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.type === 'object' || (schema.properties && !schema.type)) {
    const props: string[] = [];

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propZod = generateZodSchema(propName, propSchema, definedSchemas, generatedSchemas);
        props.push(`    ${propName}: ${propZod}`);
      }
    }

    let zod: string;
    if (props.length === 0) {
      zod = 'z.record(z.string(), z.unknown())';
    } else {
      zod = `z.object({\n${props.join(',\n')}\n  })`;
    }
    if (schema.nullable) {
      zod += '.nullish()';
    }
    return zod;
  }

  if (schema.nullable) {
    return 'z.null()';
  }

  return 'z.unknown()';
}

function processSchemas(schemas: Record<string, OpenAPISchema>) {
  const enums: { name: string; values: string[] }[] = [];
  const interfaces: { name: string; content: string }[] = [];
  const typeAliases: { name: string; type: string }[] = [];
  const zodSchemas: { name: string; schema: string }[] = [];

  const definedSchemas = new Set<string>();
  for (const name of Object.keys(schemas)) {
    definedSchemas.add(sanitizeIdentifier(name));
  }

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const name = sanitizeIdentifier(schemaName);

    if (schema.type === 'string' && schema.enum) {
      const values = schema.enum.map((v) => `'${v}'`);
      enums.push({ name, values });
      zodSchemas.push({
        name: `${name}Schema`,
        schema: `z.enum([${values.join(', ')}])`,
      });
      continue;
    }

    if (schema.type === 'object' || schema.properties || schema.allOf) {
      interfaces.push({
        name,
        content: generateInterface(name, schema, definedSchemas),
      });
      const zod = generateZodSchema(name, schema, definedSchemas, new Map());
      zodSchemas.push({
        name: `${name}Schema`,
        schema: zod,
      });
      continue;
    }

    if (schema.type) {
      const typeName = getTypeFromSchema(schema, definedSchemas);
      typeAliases.push({ name, type: typeName });
      const zod = generateZodSchema(name, schema, definedSchemas, new Map());
      zodSchemas.push({
        name: `${name}Schema`,
        schema: zod,
      });
      continue;
    }

    if (schema.anyOf || schema.oneOf) {
      const typeName = getTypeFromSchema(schema, definedSchemas);
      typeAliases.push({ name, type: typeName });
      const zod = generateZodSchema(name, schema, definedSchemas, new Map());
      zodSchemas.push({
        name: `${name}Schema`,
        schema: zod,
      });
      continue;
    }
  }

  return { enums, interfaces, typeAliases, zodSchemas };
}

function generateFiles(openApiPath: string) {
  console.log(`Reading OpenAPI from: ${openApiPath}`);
  const openApiContent = fs.readFileSync(openApiPath, 'utf-8');
  const openApi: OpenAPIDocument = JSON.parse(openApiContent);

  if (!openApi.components?.schemas) {
    console.error('No schemas found in OpenAPI document');
    process.exit(1);
  }

  const schemas = openApi.components.schemas;
  console.log(`Found ${Object.keys(schemas).length} schemas`);

  const { enums, interfaces, typeAliases, zodSchemas } = processSchemas(schemas);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const enumsContent = [
    "import { z } from 'zod';",
    '',
    ...enums.map((e) => `export enum ${e.name} {\n${e.values.map(v => `  ${v.replace(/'/g, '')} = ${v}`).join(',\n')}\n}`),
  ].join('\n');

  const typeDefinitions = interfaces.map((i) => {
    const fields = i.content
      .replace(/export interface \w+ \{/, '')
      .replace(/\}\s*$/, '')
      .trim()
      .split('\n')
      .map(line => {
        const match = line.match(/^\s*(\w+)(\?)?:\s*(.+?);?$/);
        if (!match) return null;
        const [, prop, optional, type] = match;
        return `  ${prop}${optional || ''}: ${type.trim()};`;
      })
      .filter(Boolean)
      .join('\n');
    return `export type ${i.name} = Partial<{\n${fields}\n}>;`;
  });

  const interfacesFileContent = [
    ...interfaces.map((i) => i.content),
    '',
    ...typeDefinitions,
  ].join('\n\n');

  const schemasContent = [
    "import { z } from 'zod';",
    '',
    ...zodSchemas.map((s) => `export const ${s.name} = z.lazy(() => ${s.schema});`),
  ].join('\n\n');

  const typesContent = [
    "export * from './interfaces';",
    "export * from './schemas';",
  ].join('\n');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'enums.ts'), enumsContent);
  console.log(`Written enums.ts with ${enums.length} enums`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'interfaces.ts'), interfacesFileContent);
  console.log(`Written interfaces.ts with ${interfaces.length} interfaces`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'types.ts'), typesContent);
  console.log(`Written types.ts`);

  fs.writeFileSync(path.join(OUTPUT_DIR, 'schemas.ts'), schemasContent);
  console.log(`Written schemas.ts with ${zodSchemas.length} schemas`);

  console.log(`\nGenerated files in ./${OUTPUT_DIR}/`);
}

const openApiPath = process.argv[2] || 'stripeopenapi.json';
generateFiles(openApiPath);
