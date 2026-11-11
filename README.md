# People Constellation

A private, personal relationship constellation. The app supports a local demo and Google sign-in with an API Gateway HTTP API backend. The bundled sample constellation is stored locally and is never uploaded during sign-in.

## Run locally

Requirements: Node.js 22+ and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

To enable Google sign-in, configure the Google OAuth web client and API Gateway first, then set the values in `.env.local`:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_API_URL=https://your-api-id.execute-api.ap-southeast-1.amazonaws.com
```

Restart Vite after editing environment variables. With these unset, the constellation continues to work in local demo mode.

## Google OAuth client

In Google Cloud Console, configure the OAuth consent screen / Google Auth Platform branding and audience. If the app is in Testing mode, add your Google account as a test user. Create an OAuth client of type **Web application** and add authorized JavaScript origins for `http://localhost:5173` and your exact hosted frontend origin. The browser needs only the client ID; do not use or expose a client secret in frontend code.

Google ID tokens use issuer `https://accounts.google.com`, have the OAuth web client ID in `aud`, and provide a stable `sub` for user identity. The app sends the ID token as `Authorization: Bearer ...`; it never uses email as the database key. References: [Google OIDC token reference](https://developers.google.com/identity/openid-connect/reference) and [Google OIDC guidance](https://developers.google.com/identity/openid-connect/openid-connect).

## Manual AWS Console setup

The app expects an **API Gateway HTTP API + JWT authorizer + Lambda + DynamoDB**. No AppSync and no Cognito are used.

### DynamoDB

Create an on-demand table named `PeopleConstellation` with:

- Partition key: `PK`, String
- Sort key: `SK`, String

The Lambda stores each caller under `USER#<verified Google sub>`, with sort key prefixes `PERSON#`, `CONNECTION#`, `ACTIVITY#`, and `SETTINGS`.

### API Gateway JWT authorizer

Create an HTTP API, then create a JWT authorizer with:

- Identity source: `$request.header.Authorization`
- Issuer: `https://accounts.google.com`
- Audience: your Google OAuth web client ID ending in `.apps.googleusercontent.com`

Attach it to every data route. API Gateway validates the token signature and issuer/audience/time claims before invoking Lambda. The Lambda uses the verified JWT `sub` claim to scope all DynamoDB access. See [AWS HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

Set CORS to the exact frontend origin and allow `authorization`, `content-type`, and `if-match` headers. The routes and methods expected by the app are:

| Route | Methods |
|---|---|
| `/people` | GET, POST |
| `/people/{id}` | GET, PUT, DELETE |
| `/people/{id}/activities` | GET, POST |
| `/connections` | GET, POST |
| `/connections/{id}` | DELETE |
| `/settings` | GET, PUT |

Each route needs a Lambda integration. The Lambda needs access to the table and environment variable `TABLE_NAME=PeopleConstellation`. The handler source is in `backend/src/handler.ts`; it expects API Gateway HTTP API payload format 2.0.

## CDK source reference

The `infra/` folder is retained as reference code only. This project does not run CDK, deploy, bootstrap, or create AWS resources. Create and configure the AWS resources yourself in the AWS Console. Use the DynamoDB schema, API routes, JWT authorizer values, CORS settings, Lambda environment variable, and permissions described above.
## Frontend hosting

Amplify Hosting can build the frontend with `npm run build` and publish `dist`. Set `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` in Amplify environment variables. Add the exact Amplify domain to Google OAuth authorized JavaScript origins and update API CORS to that exact origin.

## Scripts

- `npm run dev` — local Vite server
- `npm run build` — type-check and production build
- `npm run lint` — Oxlint
- `npm test` — recency logic tests
- `npm run preview` — preview the production frontend

