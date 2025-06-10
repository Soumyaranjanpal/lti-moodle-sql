import { ZodError, z } from "zod";
import {
  NonceAlreadyUsedError,
  PlatformNotFoundError,
  createToolLtiToken,
  getHighestPriorityRole,
  validatePlatformToken,
} from "../utils/auth";
import { getStateCookieName } from "../utils/cookie";
import jwt from "jsonwebtoken";
import { storeIDToken } from "../storage/idToken";

const launchBodySchema = z.object({
  id_token: z.string(),
  state: z.string(),
});

export default defineEventHandler(async (event) => {
  const { serverUrl } = useRuntimeConfig();
  console.log("Runtime config - serverUrl:", serverUrl);

  const body = await readBody(event);
  console.log("Launch request body:", body);

  let idToken, state;
  try {
    ({ id_token: idToken, state } = await launchBodySchema.parseAsync(body));
    console.log("Parsed id_token:", idToken);
    console.log("Parsed state:", state);
  } catch (error: any) {
    console.error("Error parsing launch body", error);
    if (error instanceof ZodError) {
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
    tokenPayload = await validatePlatformToken(idToken);
    console.log("Validated token payload:", tokenPayload);
  } catch (error) {
    console.error("Error validating platform token", error);
    if (error instanceof PlatformNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: error.message,
      });
    }
    if (error instanceof NonceAlreadyUsedError) {
      throw createError({
        statusCode: 401,
        statusMessage: error.message,
      });
    }
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
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
  console.log("Cookie name:", cookieName);
  console.log("Issuer from cookie:", issuer);
  deleteCookie(event, cookieName);

  if (!issuer || tokenPayload.iss !== issuer) {
    console.warn("Invalid state detected. Issuer mismatch.");
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid state",
    });
  }

  const resourceId =
    tokenPayload["https://purl.imsglobal.org/spec/lti/claim/custom"]
      .resource_id;
  console.log("Resource ID from token:", resourceId);

  const roles = tokenPayload["https://purl.imsglobal.org/spec/lti/claim/roles"];
  console.log("roles", roles);

  const role = getHighestPriorityRole(roles) || "Learner";

  if (!resourceId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Resource ID not found",
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
  await storeIDToken(tokenPayload);

  // console.info("Storing ID token with key:", idTokenStorageKey);
  console.debug("ID token payload being stored:", tokenPayload);

  // await idTokenStorage.setItem(idTokenStorageKey, tokenPayload);

  const ltiToken = createToolLtiToken(tokenPayload);

  const url = ["Administrator", "Instructor"].includes(role)
    ? new URL("ltiLaunch", "https://fb69jx5l-3001.use.devtunnels.ms/")
    : new URL("assignmentLaunch", "https://fb69jx5l-3001.use.devtunnels.ms/");

  // const url = new URL(`resources/${resourceId}`, serverUrl);
  url.searchParams.append("lti", ltiToken);
  url.searchParams.append("id", resourceId);

  console.log("Redirecting to:", url.href);

  return sendRedirect(event, url.href);
});
