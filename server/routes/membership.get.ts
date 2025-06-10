import jwt from "jsonwebtoken";
import { getAccessToken, jwtVerify } from "../utils/auth";
import { getPlatform } from "../storage/platform";
import { ToolLtiTokenPayload } from "../types/toolLtiToken";
import { getIDToken } from "../storage/idToken";

export default defineEventHandler(async (event) => {
  const { jwtSecret } = useRuntimeConfig();

  const Authorization = getHeader(event, "Authorization");
  const schema = Authorization?.split(" ")[0];
  const token = Authorization?.split(" ")[1];
  if (schema !== "Bearer") {
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid schema",
    });
  }
  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: "Token not found",
    });
  }

  let toolToken;
  try {
    toolToken = await jwtVerify(token, jwtSecret);
  } catch (error) {
    console.error("Error validating tool token", error);
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

  const { clientId, platformUrl, deploymentId, userId } =
    toolToken as ToolLtiTokenPayload;
  const platform = await getPlatform(platformUrl, clientId);
  if (!platform) {
    throw createError({
      statusCode: 404,
      statusMessage: "Platform not found",
    });
  }

  const idToken = await getIDToken({
    issuer: platformUrl,
    clientId,
    deploymentId,
    userId,
  });
  if (!idToken) {
    throw createError({
      statusCode: 404,
      statusMessage: "ID token not found",
    });
  }

  const { accessToken, tokenType } = await getAccessToken(platform, [
    "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
  ]);

  const { context_memberships_url: membershipUrl } =
    idToken["https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice"];
  return $fetch(membershipUrl, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      Accept: "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
    },
  });
});
