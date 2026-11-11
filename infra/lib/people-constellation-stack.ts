import { Duration, RemovalPolicy, Stack, type StackProps, CfnOutput } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { HttpApi, CorsHttpMethod, HttpMethod, PayloadFormatVersion } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { join } from 'node:path'

interface PeopleConstellationStackProps extends StackProps { allowedOrigin: string; googleClientId: string }
export class PeopleConstellationStack extends Stack {
  constructor(scope: Construct, id: string, props: PeopleConstellationStackProps) {
    super(scope, id, props)
    const table = new Table(this, 'PeopleConstellationTable', {
      tableName: 'PeopleConstellation', partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING }, billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    const apiHandler = new NodejsFunction(this, 'PeopleApiHandler', {
      entry: join(__dirname, '../../../backend/src/handler.ts'), handler: 'handler', runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(15), memorySize: 256,
      environment: { TABLE_NAME: table.tableName }, bundling: { minify: true, sourceMap: true, target: 'node22' },
    })
    table.grantReadWriteData(apiHandler)
    const api = new HttpApi(this, 'PeopleConstellationApi', {
      apiName: 'PeopleConstellationApi', corsPreflight: { allowOrigins: [props.allowedOrigin], allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS], allowHeaders: ['authorization', 'content-type', 'if-match'], maxAge: Duration.hours(1) },
    })
    const authorizer = new HttpJwtAuthorizer('GoogleJwtAuthorizer', `https://accounts.google.com`, { jwtAudience: [props.googleClientId], identitySource: ['$request.header.Authorization'] })
    const integration = new HttpLambdaIntegration('PeopleApiIntegration', apiHandler, { payloadFormatVersion: PayloadFormatVersion.VERSION_2_0 })
    const routes: Array<[string, HttpMethod[]]> = [
      ['/people', [HttpMethod.GET, HttpMethod.POST]], ['/people/{id}', [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE]],
      ['/people/{id}/activities', [HttpMethod.GET, HttpMethod.POST]], ['/connections', [HttpMethod.GET, HttpMethod.POST]],
      ['/connections/{id}', [HttpMethod.DELETE]], ['/settings', [HttpMethod.GET, HttpMethod.PUT]],
    ]
    for (const [path, methods] of routes) for (const method of methods) api.addRoutes({ path, methods: [method], integration, authorizer })
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint })
    new CfnOutput(this, 'GoogleOAuthClientId', { value: props.googleClientId })
    new CfnOutput(this, 'Region', { value: this.region })
  }
}





