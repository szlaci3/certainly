# Certainly on Netlify

Import this repository into Netlify. The checked-in netlify.toml publishes public/ and bundles the TypeScript function. Leave the build command empty. Configure these environment variables with **Functions** scope before deploying:

- **GEMINI_API_KEY** — a Gemini API key with access to the Antigravity preview agent.
- **JOB_TOKEN_SECRET** — generate a random secret once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it stable across instances and deploys. Rotation invalidates outstanding polling links.

For local development use Node 24, set the two variables in your shell and run `npx netlify-cli dev` from the repository root. Run the backend checks with `node --test tests/material.test.mjs`.

The frontend starts generation with POST /api/material and polls GET /api/material/:job. Google stores the background interaction. A signed, one-hour handle lets any function instance poll it without a local database. Uploads and completed textures remain in the browser's IndexedDB.
