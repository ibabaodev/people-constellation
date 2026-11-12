# People Constellation

## What this project is

People Constellation is a private relationship tracker that turns the people in your life into a visual constellation. Each person appears as a star on a canvas. You can record when you last connected, keep a personal note, and link people who know one another.

The app is designed to make it easier to remember and nurture relationships without turning them into a public social network or a competitive scorecard.

## What you can do

- Sign in with Google to access your account-specific constellation.
- Add, edit, and remove people, with a relationship type, last-contact date, and private note.
- Arrange and zoom or pan around the constellation canvas.
- Connect people with relationship lines.
- Use relationship filters and search to find people.
- See recent connection activity and record a new moment when you connect.
- Review a gentle reconnect list for people you have not contacted recently.
- Use the responsive interface on desktop and mobile.

Star brightness reflects how recently you connected. The application stores each person's position and relationship details so the constellation can be arranged to suit you.

## How it works

The frontend is a React and TypeScript single-page application built with Vite. Google Identity Services provides sign-in. After sign-in, the browser sends the Google ID token to an authenticated API Gateway HTTP API.

The backend is an AWS Lambda handler. It verifies the token through API Gateway's JWT authorizer and stores data in DynamoDB. DynamoDB records are partitioned by the verified Google account subject (`sub`), keeping each account's data scoped to that account.

```text
React + TypeScript frontend
        | Google ID token
        v
API Gateway HTTP API + JWT authorizer
        |
        v
AWS Lambda handler
        |
        v
DynamoDB
```

## Main data

- **People:** name, relationship type, personal notes, last-contact date, and canvas position.
- **Connections:** links between two people in the constellation.
- **Activities:** dated records of moments when you connected with a person.

## Project structure

- `src/` - React application, styles, domain helpers, and API client.
- `backend/` - API Lambda handler and packaging configuration.
- `infra/` - CDK source retained as reference; the documented setup uses the AWS Console.
- `public/` - static assets served by Vite.

## Run locally

Requirements: Node.js 22 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env.local
```

Set these values in `.env.local` before starting the app:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_API_URL=https://your-api-id.execute-api.your-region.amazonaws.com
```

Then run:

```powershell
npm run dev
```

Google OAuth must allow the local origin `http://localhost:5173`. The API must have matching CORS configuration. For a hosted frontend, configure `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` in the hosting provider's environment settings, allow the hosted origin in Google OAuth and API CORS, and redeploy.

## Useful commands

- `npm run dev` - start the local Vite development server.
- `npm run build` - type-check and build the production frontend.
- `npm run lint` - run Oxlint.
- `npm run preview` - serve the production build locally.

For detailed AWS and Google setup instructions, see [README.md](README.md).
