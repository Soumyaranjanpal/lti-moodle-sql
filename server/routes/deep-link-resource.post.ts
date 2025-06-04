import { ZodError, z } from "zod";
import { getPlatform } from "../storage/platform";
import { getPrivateKey } from "../storage/privateKey";
import { jwtVerify } from "../utils/auth";
import jwt from "jsonwebtoken";
import { ToolLtiTokenPayload } from "../types/toolLtiToken";
import useIDTokenStorage, { getIDTokenStorageKey } from "../storage/idToken";

const deepLinkResourceBodySchema = z.object({
  resourceId: z.number(),
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  console.log("[LTI] Launch Body received:", body);

  const { jwtSecret } = useRuntimeConfig();
  console.log("[LTI] Loaded JWT secret");

  let resourceId;
  try {
    ({ resourceId } = await deepLinkResourceBodySchema.parseAsync(body));
    console.log("[LTI] Parsed resourceId from body:", resourceId);
  } catch (error: any) {
    console.error("[LTI] Error parsing deep link resource body:", error);
    if (error instanceof ZodError) {
      console.warn("[LTI] Zod validation errors:", error.errors);
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

  const Authorization = getHeader(event, "Authorization");
  console.log("[LTI] Authorization header:", Authorization);

  const schema = Authorization?.split(" ")[0];
  const token = Authorization?.split(" ")[1];
  console.log("[LTI] Parsed schema:", schema);
  console.log("[LTI] Parsed token:", token ? "REDACTED" : "None");

  if (schema !== "Bearer") {
    console.warn("[LTI] Invalid auth schema:", schema);
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid schema",
    });
  }
  if (!token) {
    console.warn("[LTI] Token not found");
    throw createError({
      statusCode: 401,
      statusMessage: "Token not found",
    });
  }

  let toolToken;
  try {
    toolToken = await jwtVerify(token, jwtSecret);
    console.log("[LTI] Token verified:", toolToken);
  } catch (error) {
    console.error("[LTI] Error validating tool token:", error);
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
  console.log("[LTI] Extracted from tool token:", {
    clientId,
    platformUrl,
    deploymentId,
    userId,
  });

  const searchParams = new URLSearchParams();
  searchParams.append("resourceId", resourceId.toString());

  const item = {
    type: "ltiResourceLink",
    title: "Lti Tool Demo",
    custom: {
      resource_id: resourceId,
    },
    lineItem: {
      scoreMaximum: 100,
      resourceId,
    },
  };

  const jwtBody = {
    iss: clientId,
    aud: platformUrl,
    iat: Math.floor(Date.now() / 1000) - 60,
    nonce: encodeURIComponent(
      [...Array(25)]
        .map((_) => ((Math.random() * 36) | 0).toString(36))
        .join("")
    ),
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id": deploymentId,
    "https://purl.imsglobal.org/spec/lti/claim/message_type":
      "LtiDeepLinkingResponse",
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
    "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [item],
  };
  console.log("[LTI] JWT body prepared for deep linking:", jwtBody);

  const platform = await getPlatform(platformUrl, clientId);
  if (!platform) {
    console.warn("[LTI] Platform not found:", `${platformUrl}:${clientId}`);
    throw createError({
      statusCode: 404,
      statusMessage: "Platform not found",
    });
  }
  console.log("[LTI] Platform config found:", platform);
  const platformPrivateKey = await getPrivateKey(platform.kid);
  if (!platformPrivateKey) {
    console.warn("[LTI] Platform private key not found for KID:", platform.kid);
    throw createError({
      statusCode: 404,
      statusMessage: "Platform private key not found",
    });
  }
  console.log("[LTI] Private key loaded for KID:", platform.kid);

  const message = jwt.sign(jwtBody, platformPrivateKey, {
    algorithm: "RS256",
    expiresIn: 120,
    keyid: platform.kid,
  });
  console.log("[LTI] Signed JWT for deep linking response");

  const idTokenStorage = useIDTokenStorage();
  const idToken = await idTokenStorage.getItem(
    getIDTokenStorageKey({
      issuer: platformUrl,
      clientId,
      deploymentId,
      userId,
    })
  );
  if (!idToken) {
    console.warn("[LTI] ID token not found for user:", {
      issuer: platformUrl,
      clientId,
      deploymentId,
      userId,
    });
    throw createError({
      statusCode: 404,
      statusMessage: "ID token not found",
    });
  }

  const returnUrl =
    idToken[
      "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
    ]?.deep_link_return_url;
  console.log("[LTI] Return URL for deep linking:", returnUrl);

  appendResponseHeaders(event, {
    "content-type": "text/html",
  });

  console.log("[LTI] Sending auto-submitting form to:", returnUrl);
  return `<form id="ltijs_submit" style="display: none;" action="${returnUrl}" method="POST">
            <input type="hidden" name="JWT" value="${message}" />
          </form>
          <script>
            document.getElementById("ltijs_submit").submit()
          </script>`;
});
