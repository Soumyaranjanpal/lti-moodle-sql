import { ZodError, z } from "zod";
import { generatePlatformKeyPair } from "../utils/auth";
import { getConnection } from "~/dbScripts/db";

type Configuration = {
  issuer: string;
  token_endpoint: string;
  jwks_uri: string;
  authorization_endpoint: string;
  registration_endpoint: string;
  claims_supported: string[];
  "https://purl.imsglobal.org/spec/lti-platform-configuration": {
    product_family_code: string;
  };
};

const registrationQuerySchema = z.object({
  openid_configuration: z.string(),
  registration_token: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const { serverUrl } = useRuntimeConfig();

  let configurationEndpoint, registrationToken;
  try {
    ({
      openid_configuration: configurationEndpoint,
      registration_token: registrationToken,
    } = await registrationQuerySchema.parseAsync(query));
  } catch (error: any) {
    console.error("Error parsing query", error);
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

  const configuration: Configuration = await $fetch(configurationEndpoint);
  const scope = [
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
    "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
  ];
  const launchUrl = new URL("launch", serverUrl);
  const deepLinkUrl = new URL("deep-link-launch", serverUrl);
  const loginUrl = new URL("login", serverUrl);
  const keysUrl = new URL("keys", serverUrl);
  const registrationRequest = {
    application_type: "web",
    grant_types: ["implicit", "client_credentials"],
    response_types: ["id_token"],
    redirect_uris: [launchUrl.href, deepLinkUrl.href],
    initiate_login_uri: loginUrl.href,
    client_name: "Quezzio",
    jwks_uri: keysUrl.href,
    logo_uri:
      "https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.wolfram.com%2F&psig=AOvVaw2Z0GRtTXM8KF90b0ssPOBm&ust=1748609058342000&source=images&cd=vfe&opi=89978449&ved=0CBIQjRxqFwoTCPjf18XayI0DFQAAAAAdAAAAABAE",
    token_endpoint_auth_method: "private_key_jwt",
    scope: scope.join(" "),
    "https://purl.imsglobal.org/spec/lti-tool-configuration": {
      domain: serverUrl,
      description: "Quezzio Testing LTI Tool",
      target_link_uri: launchUrl.href,
      custom_parameters: {},
      claims: configuration.claims_supported,
      messages: [
        { type: "LtiResourceLinkRequest" },
        {
          type: "LtiDeepLinkingRequest",
          target_link_uri: deepLinkUrl.href,
        },
      ],
    },
  };

  const { client_id: clientId }: { client_id: string } = await $fetch(
    configuration.registration_endpoint,
    {
      method: "POST",
      body: registrationRequest,
      headers: {
        Authorization: `Bearer ${registrationToken}`,
      },
    }
  );

  const platformName =
    configuration["https://purl.imsglobal.org/spec/lti-platform-configuration"]
      .product_family_code;

  const kid = await generatePlatformKeyPair();
  const platform = {
    url: configuration.issuer,
    name: platformName,
    clientId,
    authenticationEndpoint: configuration.authorization_endpoint,
    accesstokenEndpoint: configuration.token_endpoint,
    authConfig: {
      method: "JWK_SET",
      key: configuration.jwks_uri,
    },
    kid,
  };

  const connection = await getConnection();

  const [rows] = await connection.execute(
    `SELECT id FROM platforms WHERE url = ? AND client_id = ?`,
    [platform.url, platform.clientId]
  );

  console.log(rows);
  if ((rows as any[]).length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: "Platform already registered",
    });
  }

  // if (await storage.hasItem(`${platform.url}:${platform.clientId}`)) {
  //   throw createError({
  //     statusCode: 409,
  //     statusMessage: "Platform already registered",
  //   });
  // }

  console.info("New platform registered:", platform);

  await connection.execute(
    `INSERT INTO platforms (
    url, name, client_id, authentication_endpoint,
    accesstoken_endpoint, auth_method, auth_key, kid
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      platform.url,
      platform.name,
      platform.clientId,
      platform.authenticationEndpoint,
      platform.accesstokenEndpoint,
      platform.authConfig.method,
      platform.authConfig.key,
      platform.kid,
    ]
  );
  // await storage.setItem(`${platform.url}:${platform.clientId}`, platform);

  appendResponseHeaders(event, {
    "content-type": "text/html",
  });
  return '<script>(window.opener || window.parent).postMessage({subject:"org.imsglobal.lti.close"}, "*");</script>';
});
