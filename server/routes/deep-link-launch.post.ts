import { ZodError, z } from "zod";
import {
  NonceAlreadyUsedError,
  PlatformNotFoundError,
  createToolLtiToken,
  validatePlatformToken,
} from "../utils/auth";
import { getStateCookieName } from "../utils/cookie";
import jwt from "jsonwebtoken";
import { storeIDToken } from "../storage/idToken";

const deepLinkLaunchBodySchema = z.object({
  id_token: z.string(),
  state: z.string(),
});

export default defineEventHandler(async (event) => {
  const { serverUrl } = useRuntimeConfig();
  console.log("[LTI] Server URL:", serverUrl);

  const body = await readBody(event);
  console.log("[LTI] Received Body:", body);

  let idToken, state;
  try {
    ({ id_token: idToken, state } = await deepLinkLaunchBodySchema.parseAsync(
      body
    ));
    console.log("[LTI] Parsed id_token and state:", { idToken, state });
  } catch (error: any) {
    console.error("[LTI] Error parsing launch body", error);
    if (error instanceof ZodError) {
      console.warn("[LTI] Zod validation failed:", error.errors);
      throw createError({
        statusCode: 400,
        statusMessage: error.message,
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Something went wrong",
    });
  }

  let tokenPayload;
  try {
    console.log("[LTI] Validating platform token...");
    tokenPayload = await validatePlatformToken(idToken);
    console.log("[LTI] Token payload:", tokenPayload);
  } catch (error) {
    console.error("[LTI] Error validating platform token", error);
    if (error instanceof PlatformNotFoundError) {
      console.warn("[LTI] Platform not found:", error.message);
      throw createError({
        statusCode: 404,
        statusMessage: error.message,
      });
    }
    if (error instanceof NonceAlreadyUsedError) {
      console.warn("[LTI] Nonce reuse detected");
      throw createError({
        statusCode: 401,
        statusMessage: error.message,
      });
    }
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      console.warn("[LTI] JWT error:", error.message);
      throw createError({
        statusCode: 401,
        statusMessage: "Invalid token",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: "Something went wrong",
    });
  }

  const cookieName = getStateCookieName(state);
  const issuer = getCookie(event, cookieName);
  console.log("[LTI] Cookie name:", cookieName);
  console.log("[LTI] Retrieved issuer from cookie:", issuer);

  deleteCookie(event, cookieName);

  if (!issuer || tokenPayload.iss !== issuer) {
    console.warn("[LTI] Invalid state: issuer mismatch or missing");
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid state",
    });
  }

  // const idTokenStorage = useIDTokenStorage();
  // const idTokenStorageKey = getIDTokenStorageKey({
  //   issuer: tokenPayload.iss,
  //   clientId: tokenPayload.aud,
  //   deploymentId:
  //     tokenPayload["https://purl.imsglobal.org/spec/lti/claim/deployment_id"],
  //   userId: tokenPayload.sub,
  // });

  // console.info("[LTI] Storing ID token with key:", idTokenStorageKey);
  // await idTokenStorage.setItem(idTokenStorageKey, tokenPayload);

  await storeIDToken(tokenPayload);

  const ltiToken = createToolLtiToken(tokenPayload);
  console.log("[LTI] Created LTI token:", ltiToken);

  const url = new URL(
    "deep-link-select",
    "https://fb69jx5l-3001.use.devtunnels.ms/"
  );
  url.searchParams.append("lti", ltiToken);

  console.log("[LTI] Redirecting to:", url.href);
  return sendRedirect(event, url.href);
});
