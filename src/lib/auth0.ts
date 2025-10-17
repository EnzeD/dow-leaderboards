import { NextResponse } from "next/server";
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

const isConfigured = Boolean(domain && clientId && clientSecret && process.env.AUTH0_SECRET);
const missingConfigError = new Error("Auth0 environment variables are not fully configured.");

if (!isConfigured && process.env.NODE_ENV !== "production") {
  console.warn("[auth0] Environment variables are not fully configured; authentication helpers are disabled.");
}

export const auth0 = isConfigured
  ? new Auth0Client({
      domain,
      clientId,
      clientSecret,
      appBaseUrl,
      authorizationParameters,
    })
  : (new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "middleware") {
            return () => Promise.resolve(NextResponse.next());
          }
          if (property === "getSession") {
            return () => Promise.resolve(null);
          }
          return () => Promise.reject(missingConfigError);
        },
      },
    ) as Auth0Client);

export const auth0Configured = isConfigured;
