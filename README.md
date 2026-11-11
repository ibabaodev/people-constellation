# People Constellation

A private, personal relationship constellation. Google sign-in and the API Gateway HTTP API backend are required to use the app. People and connections are stored in DynamoDB under the signed-in Google account.

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

Restart Vite after editing environment variables. Both values are required: without a Google client ID or a working API URL, sign-in cannot complete and the app remains locked at the sign-in screen.

## Google OAuth client

In Google Cloud Console, configure the OAuth consent screen / Google Auth Platform branding and audience. If the app is in Testing mode, add your Google account as a test user. Create an OAuth client of type **Web application** and add authorized JavaScript origins for `http://localhost:5173` and your exact hosted frontend origin. The browser needs only the client ID; do not use or expose a client secret in frontend code.

Google ID tokens use issuer `https://accounts.google.com`, have the OAuth web client ID in `aud`, and provide a stable `sub` for user identity. The app sends the ID token as `Authorization: Bearer ...`; it never uses email as the database key. References: [Google OIDC token reference](https://developers.google.com/identity/openid-connect/reference) and [Google OIDC guidance](https://developers.google.com/identity/openid-connect/openid-connect).

## Manual AWS Console setup

This is a console-only setup. Do not use CDK for these steps. The deployed API uses API Gateway HTTP API, Google JWT authentication, Lambda, and DynamoDB. Creating only the API and table is not enough: routes must invoke the Lambda handler.

### 1. Create the Google OAuth web client

In Google Cloud Console, configure the consent screen and create an OAuth client of type **Web application**. Add the authorized JavaScript origin `http://localhost:5173` and later your exact hosted frontend origin. Copy the client ID ending in `.apps.googleusercontent.com`. In testing mode, add your Google account as a test user. Never copy a client secret into the frontend.

### 2. Create the DynamoDB table

In AWS Console, open **DynamoDB → Tables → Create table**:

- Table name: `PeopleConstellation`
- Partition key: `PK`, type **String**
- Sort key: `SK`, type **String**
- Table settings: **On-demand** capacity

No secondary indexes are needed.

### 3. Prepare the Lambda upload ZIP

From the repository, package the backend handler. This builds a ZIP only; it does not contact AWS or deploy anything. In PowerShell:

```powershell
Set-Location 'C:\Users\Admin\Documents\IBABAO\people-constellation\backend'
npm install
npm run bundle
Compress-Archive -Path .\dist\index.mjs -DestinationPath .\lambda-function.zip -Force
```

The ZIP contains `index.js` at its root (CommonJS bundle). The Lambda console handler setting will be `index.handler`.

### 4. Create the Lambda execution role and function

In **IAM → Roles → Create role**, choose **AWS service → Lambda** and add the basic Lambda/CloudWatch Logs execution policy. Then add an inline policy allowing these DynamoDB actions on only your `PeopleConstellation` table ARN:

- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:Query`
- `dynamodb:TransactWriteItems`

In **Lambda → Functions → Create function**, create a function from scratch:

- Runtime: **Node.js 22.x**
- Execution role: the role above
- Upload `backend\lambda-function.zip` under **Code → Upload from → .zip file**
- Runtime settings handler: `index.handler`
- Configuration → Environment variables: `TABLE_NAME` = `PeopleConstellation`
- General configuration: timeout 15 seconds; memory 256 MB

The handler expects API Gateway HTTP API payload format **2.0**.

### 5. Create the API and JWT authorizer

In **API Gateway → Create API → HTTP API**, create an HTTP API and add a JWT authorizer:

- Identity source: `$request.header.Authorization`
- Issuer URL: `https://accounts.google.com`
- Audience: your Google OAuth web client ID

For CORS, set the allowed origin to `http://localhost:5173`, methods to `GET`, `POST`, `PUT`, `DELETE`, and headers to `authorization`, `content-type`, `if-match`. Replace the origin with the exact hosted site origin when you host the frontend.

### 6. Add routes and Lambda integrations

Create each route below, integrate it with the Lambda function, set payload format to **2.0**, and attach the Google JWT authorizer. Do not use only a greedy `/{proxy+}` route: the handler reads the `{id}` path parameter for person and connection routes.

| Route | Methods |
|---|---|
| `/people` | GET, POST |
| `/people/{id}` | GET, PUT, DELETE |
| `/people/{id}/activities` | GET, POST |
| `/people/{id}/activities/{activityId}` | DELETE |
| `/connections` | GET, POST |
| `/connections/{id}` | DELETE |
| `/settings` | GET, PUT |

Use the `$default` stage with auto-deploy enabled, or deploy the API after adding routes. Copy the Invoke URL shown by API Gateway.

API Gateway and Lambda use execution/integration roles to invoke the function. Allow API Gateway to invoke this Lambda through the console's integration permission prompt if it appears.

### 7. Configure the frontend

Create `.env.local` in the repository root:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_API_URL=https://your-api-id.execute-api.ap-southeast-1.amazonaws.com
```

Use your actual API Invoke URL (no route suffix and no trailing slash). Restart `npm run dev`. Sign in with Google; after successful API setup the app loads and saves that account's constellation. The app requires sign-in before showing or changing any people data.

To enable **Undo** for a recent moment, redeploy the updated Lambda ZIP and add an authenticated API Gateway route `DELETE /people/{id}/activities/{activityId}` integrated with the same Lambda using payload format 2.0. The existing `DELETE` method is already included in the configured CORS methods.

The API authorizer validates Google ID token signatures, issuer, audience, and expiration. Lambda scopes each DynamoDB partition with the verified token `sub`; email is not used as the user key. See [Google's OIDC token reference](https://developers.google.com/identity/openid-connect/reference) and [AWS HTTP API JWT authorizer guide](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).
## CDK source reference

The `infra/` folder is retained as reference code only. This project does not run CDK, deploy, bootstrap, or create AWS resources. Create and configure the AWS resources yourself in the AWS Console. Use the DynamoDB schema, API routes, JWT authorizer values, CORS settings, Lambda environment variable, and permissions described above.
## Frontend hosting

Amplify Hosting can build the frontend with `npm run build` and publish `dist`. Set `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` in Amplify environment variables. Add the exact Amplify domain to Google OAuth authorized JavaScript origins and update API CORS to that exact origin.

## Scripts

- `npm run dev` — local Vite server
- `npm run build` — type-check and production build
- `npm run lint` — Oxlint
- `npm run preview` — preview the production frontend



