import { Auth0Client } from "@auth0/nextjs-auth0/server";

const domain = process.env.AUTH0_DOMAIN;
const clientId = process.env.AUTH0_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET;
const appBaseUrl = process.env.APP_BASE_URL ?? process.env.AUTH0_BASE_URL;
const audience = process.env.AUTH0_AUDIENCE;

const authorizationParameters: Record<string, string> = {
  scope: "openid profile email",
};

if (audience) {
  authorizationParameters.audience = audience;
}

if (!domain || !clientId || !clientSecret || !process.env.AUTH0_SECRET) {
  throw new Error("Auth0 environment variables are not fully configured.");
}

export const auth0 = new Auth0Client({
  domain,
  clientId,
  clientSecret,
  appBaseUrl,
  authorizationParameters,
});
