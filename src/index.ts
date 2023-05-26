import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandOutput,
  RespondToAuthChallengeCommand,
  ChallengeNameType,
  RespondToAuthChallengeCommandOutput
} from '@aws-sdk/client-cognito-identity-provider';

// @ts-ignore
import { default as AuthenticationHelperWrapper } from 'amazon-cognito-identity-js/lib/AuthenticationHelper.js'
// @ts-ignore
import { default as DateHelperWrapper } from 'amazon-cognito-identity-js/lib/DateHelper.js'
// @ts-ignore
import { default as BigIntegerWrapper } from 'amazon-cognito-identity-js/lib/BigInteger.js'

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// @ts-ignore
import { createHmac } from 'crypto';

const challengeResponse = async ({
  region, secretsManagerId, username, password,
}: {
  region: string,
  secretsManagerId: string,
  username: string,
  password: string
}) => {
  
  const AuthenticationHelper = AuthenticationHelperWrapper.default;
  const DateHelper = DateHelperWrapper.default;
  const BigInteger = BigIntegerWrapper.default;

  const secretsManagerClient = new SecretsManagerClient({ region: region });
  const command = new GetSecretValueCommand({ SecretId: secretsManagerId });

  const secretsManagerClientResponse = await secretsManagerClient.send(command);

  const secretString = secretsManagerClientResponse.SecretString || 'failed to response secrets manager client';
  const secretValue = JSON.parse(secretString);

  const CLIENT_SECRET: string = secretValue.COGNITO_CLIENT_SECRET
    || 'missing client secret';
  const CLIENT_ID: string = secretValue.COGNITO_CLIENT_ID
    || 'missing client id';
  const USER_POOL_ID: string = secretValue.COGNITO_USER_POOL_ID
    || 'missing user pool id';
  const USERNAME: string = username;
  const PASSWORD: string = password;

  const client = new CognitoIdentityProviderClient({ region: REGION });

  const extractUserPoolName = (userPoolId: string) => {
    const userPoolName = userPoolId.split('_')[1];
    return userPoolName;
  }

  const calculateSRP_A = async (userPoolId: string) => {
    const userPoolName = extractUserPoolName(userPoolId);
    const authenticationHelper = new AuthenticationHelper(userPoolName);
    const SRP_A = authenticationHelper.largeAValue.toString(16);
    return {SRP_A, authenticationHelper};
  }
  const { SRP_A, authenticationHelper } = await calculateSRP_A(USER_POOL_ID);


  const SECRET_HASH = createHmac('sha256', CLIENT_SECRET)
    .update(USERNAME + CLIENT_ID)
    .digest('base64');


  const initiateSrpAuthentication = async ({
    clientId,
    username,
    password,
    srpA,
    secretHash,
  }: {
    clientId: string,
    username: string,
    password: string,
    srpA: string,
    secretHash: string,
  }) => {
    const response = client.send(
      new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'USER_SRP_AUTH',
        AuthParameters: {
          USERNAME: USERNAME,
          PASSWORD: PASSWORD,
          SRP_A: SRP_A,
          SECRET_HASH: SECRET_HASH,
        },
      })
    );
    return response;
  }

  const initiateSrpAuthResponse = await initiateSrpAuthentication({
    clientId: CLIENT_ID,
    username: USERNAME,
    password: PASSWORD,
    srpA: SRP_A,
    secretHash: SECRET_HASH
  });

  const hkdfResult = {hkdf: undefined as undefined | string};
  authenticationHelper.getPasswordAuthenticationKey(
    USERNAME,
    PASSWORD,
    new BigInteger(initiateSrpAuthResponse.ChallengeParameters?.SRP_B, 16),
    new BigInteger(initiateSrpAuthResponse.ChallengeParameters?.SALT, 16),
    (err: unknown, result?: string) => {
      hkdfResult.hkdf = result;
    },
  );


  const dateHelper = new DateHelper();
  const DATE_NOW = dateHelper.getNowString();


  const generateSignature = ({
    userPoolId,
    username,
    secretBlock,
    hkdf,
  }: {
    userPoolId: string,
    username: string,
    secretBlock: string,
    hkdf: string,
  }) => {
    const userPoolName = extractUserPoolName(userPoolId);

    const msg = Buffer.concat([
      Buffer.from(userPoolName, 'utf-8'),
      Buffer.from(username, 'utf-8'),

      Buffer.from(secretBlock, 'base64'),
      Buffer.from(DATE_NOW, 'utf-8'),
    ])

    const signature = createHmac('sha256', hkdf)
      .update(msg)
      .digest('base64');

    return signature;
  }

  const secretBlockResult = (
    response: InitiateAuthCommandOutput,
  ) => {
    const maybeSecretBlock = response.ChallengeParameters?.SECRET_BLOCK;
    return maybeSecretBlock;
  }

  const SECRET_BLOCK = secretBlockResult(initiateSrpAuthResponse)
    || 'failed to extract secret block';
  const HKDF = hkdfResult.hkdf
    || 'failed to extract hkdf';

  const signature = generateSignature({
    userPoolId: USER_POOL_ID,
    username: USERNAME,
    secretBlock: SECRET_BLOCK,
    hkdf: HKDF,
  });

  const respondToAuthChallenge = async ({
    clientId,
    username,
    secretBlock,
    dateNow,
  }: {
    clientId: string,
    username: string,
    secretBlock: string,
    dateNow: string,
  }) => {
    const command = new RespondToAuthChallengeCommand({
      ChallengeName: ChallengeNameType.PASSWORD_VERIFIER,
      ChallengeResponses: {
        PASSWORD_CLAIM_SIGNATURE: signature,
        PASSWORD_CLAIM_SECRET_BLOCK: secretBlock,
        TIMESTAMP: dateNow,
        USERNAME: username,
        SECRET_HASH: SECRET_HASH,
      },
      ClientId: clientId,
    });

    return client.send(command);
  };

  const challengeResponse: RespondToAuthChallengeCommandOutput = await respondToAuthChallenge({
    clientId: CLIENT_ID,
    username: USERNAME,
    secretBlock: SECRET_BLOCK,
    dateNow: DATE_NOW,
  });

  return challengeResponse;
}


const REGION: string = process.env.REGION || 'missing region';
const SECRETS_MANAGER_ID: string = process.env.SECRETS_MANAGER_ID || 'missing secrets manager id';
const USERNAME: string = process.env.COGNITO_USERNAME || 'missing cognito username';
const PASSWORD: string = process.env.COGNITO_PASSWORD || 'missing cognito password';
console.log(await challengeResponse({
  region: REGION,
  secretsManagerId: SECRETS_MANAGER_ID,
  username: USERNAME,
  password: PASSWORD,
}));
