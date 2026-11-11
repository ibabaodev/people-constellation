import 'source-map-support/register.js'
import { App } from 'aws-cdk-lib'
import { PeopleConstellationStack } from '../lib/people-constellation-stack.js'

const app = new App()
const googleClientId = app.node.tryGetContext('googleClientId') ?? process.env.GOOGLE_CLIENT_ID
if (typeof googleClientId !== 'string' || !googleClientId.endsWith('.apps.googleusercontent.com')) {
  throw new Error('Set GOOGLE_CLIENT_ID or pass -c googleClientId=<Google OAuth web client ID> before synthesizing the stack.')
}
new PeopleConstellationStack(app, 'PeopleConstellationStack', {
  googleClientId,
  allowedOrigin: app.node.tryGetContext('allowedOrigin') ?? process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
})


