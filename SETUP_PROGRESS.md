# People Constellation Setup Progress

Updated: 2026-11-12

This note records the implementation and manual cloud setup discussed so far. AWS resources are being created by the user in the AWS Console. No CDK deploy or infrastructure deployment has been run from this repository.

## Application implementation

- React/Vite constellation UI with draggable stars, relationship categories, search/filter, add/edit/delete, manual connections, interaction history, and local-only persistence.
- Google Identity Services sign-in button is wired to obtain a Google ID token.
- On sign-in, the frontend calls the configured API and loads the account's people, connections, and activities. The Google ID token is sent as a bearer token.
- No sample people or connections are bundled. Google sign-in and a working API are required before the app can be used; people and connections are stored in DynamoDB under the verified Google account.
- The API Lambda derives the user's DynamoDB partition from the API Gateway-verified JWT `sub` claim.
- Lambda bundle output is available at `backend/lambda-function.zip`. It contains `index.js` at the ZIP root (CommonJS bundle); configure the Lambda handler as `index.handler` on Node.js 22.x.
- CDK files remain reference source only. The user wants to create AWS resources manually in the AWS Console.

## Google Cloud setup

- A Google Cloud project named **People Constellation** was created.
- Google Auth Platform branding configuration was started/completed, and a **Web application OAuth client** was created.
- The OAuth client ID is not recorded here. Copy the Client ID ending in `.apps.googleusercontent.com` from Google Auth Platform → Clients. This value is used in the frontend and as the API Gateway JWT audience.
- The client secret is not used by this browser sign-in flow. Do not put it in `.env.local` or frontend code. It appeared in a screenshot in the conversation; rotate it if it is used by any separate server-side OAuth flow.
- Add `http://localhost:5173` to the OAuth client's Authorized JavaScript origins. Add the production website origin later if/when hosted.
- The consent screen is restricted to test users while in testing mode. Add the Google account used for testing under Google Auth Platform → Audience → Test users.

## AWS Console setup discussed

### DynamoDB

Create the table with:

- Table name: `PeopleConstellation`
- Partition key: `PK` (String)
- Sort key: `SK` (String)
- Capacity mode: On-demand

The user showed the key fields filled in, but table creation completion was not confirmed in the conversation.

### Lambda

- The API wizard showed a Lambda integration named `PeopleConstellation`.
- Confirm the Lambda code ZIP was uploaded and the function has:
  - Runtime: Node.js 22.x
  - Handler: `index.handler`
  - Environment variable: `TABLE_NAME=PeopleConstellation`
  - 15-second timeout and 256 MB memory (recommended for this handler)
  - An execution role with CloudWatch Logs and DynamoDB permissions scoped to this table: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, and `TransactWriteItems`
- If the role or function is not configured, finish it in the Lambda/IAM console before testing.

### API Gateway HTTP API

The API creation wizard was configured with the `PeopleConstellation` Lambda integration and these routes:

| Route | Methods |
|---|---|
| `/people` | GET, POST |
| `/people/{id}` | GET, PUT, DELETE |
| `/people/{id}/activities` | GET, POST |
| `/people/{id}/activities/{activityId}` | DELETE (undo a recorded connection activity; add this route in API Gateway after uploading the updated Lambda) |
| `/connections` | GET, POST |
| `/connections/{id}` | DELETE |
| `/settings` | GET, PUT |

The `$default` stage has auto-deploy enabled. CORS was configured in the console with:

- Allowed origin: `http://localhost:5173`
- Allowed methods: GET, POST, OPTIONS, PUT, DELETE
- Allowed headers: `authorization`, `content-type`, `if-match`
- Credentials: No

The user was advised to save this CORS configuration. Confirmation that it was saved was not explicit.

### Remaining API Gateway security step

Create a JWT authorizer and attach it to **every data route**:

- Identity source: `$request.header.Authorization`
- Issuer: `https://accounts.google.com`
- Audience: the Google Web application OAuth Client ID (`.apps.googleusercontent.com`)

API Gateway must verify the Google token before Lambda runs. Lambda scopes records using the verified `sub`. Do not use the OAuth client secret as the audience.

## Frontend configuration

Create `.env.local` in the repository root (do not commit it) and use your actual values:

```dotenv
VITE_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
VITE_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
```

Use the API Gateway Invoke URL as the base URL with no route suffix and no trailing slash. Restart Vite after changing environment values.

The app's API client appends `/people`, `/connections`, and other route paths. API Gateway CORS must allow the exact browser origin. For Amplify hosting, add the exact Amplify origin to both Google Authorized JavaScript origins and API Gateway CORS.

## Next steps checklist

- [ ] Confirm DynamoDB table creation completed.
- [ ] Confirm Lambda has the ZIP, handler/runtime/environment, and table-scoped IAM policy.
- [ ] Confirm API creation and CORS save completed.
- [ ] Create the Google JWT authorizer in API Gateway and attach it to all listed routes.
- [ ] Add `DELETE /people/{id}/activities/{activityId}` to API Gateway after updating Lambda to enable undo for a recorded moment.
- [ ] Copy the API Invoke URL and Google Client ID into `.env.local`.
- [ ] Run the frontend, sign in with a Google account listed as a consent-screen test user, and verify API calls.
- [ ] Check AWS billing/usage after testing; free tiers and credits are limited and do not guarantee a zero bill.

## Verification recorded

- Frontend TypeScript/Vite production build passed after Google sign-in/API client changes.
- Oxlint passed after those changes.
- Lambda TypeScript build initially exposed an incorrect API Gateway event type; it was corrected to the JWT-authorized event type.
- The first ESM Lambda bundle failed at runtime with `Dynamic require of node:https is not supported`. The bundler was changed to output CommonJS; the current `backend/lambda-function.zip` contains a root `index.js`, passed `node --check`, and should replace the prior ZIP in Lambda.
- No AWS resource was created through CDK or deployed from this repository.


