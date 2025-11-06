# Wodify OpenAPI source

This folder holds the OpenAPI (Swagger) document for the Wodify API used for type generation.

Preferred workflow (Option A):

1) Export or obtain the OpenAPI JSON from the Wodify docs portal (the site appears to be powered by ReadMe). Save it as:

   apps/web/openapi/wodify.json

2) Generate TypeScript types from the spec:

   pnpm -F web wodify:types

This will write types to:

   apps/web/src/types/wodify.ts

Notes:
- The repo keeps generated types checked in for stability and zero-runtime overhead.
- If the docs provide a direct OpenAPI URL, you can temporarily run:

   pnpm -F web dlx openapi-typescript "<OPENAPI_JSON_URL>" -o apps/web/src/types/wodify.ts

  or update the `wodify:types` script to use that URL directly instead of a local file.
- When Wodify updates their API, re-export the spec and re-run the codegen.
