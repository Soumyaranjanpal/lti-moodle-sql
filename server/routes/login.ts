import { randomBytes } from "node:crypto";
import { getPlatform } from "../storage/platform";
import { getStateCookieName } from "../utils/cookie";

type LoginParams = {
  iss: string;
  target_link_uri: string;
  login_hint: string;
  lti_message_hint: string;
  client_id: string;
  lti_deployment_id: string;
};

export default defineEventHandler(async (event) => {
  console.log("Received event:", event.method);

  const params: LoginParams = isMethod(event, "GET")
    ? getQuery(event)
    : await readBody(event);

  console.log("Login parameters:", params);

  const platform = await getPlatform(params.iss, params.client_id);

  console.log("Retrieved platform:", platform);

  if (!platform) {
    console.error("Platform not found:", `${params.iss}:${params.client_id}`);
    throw createError({
      statusCode: 404,
      statusMessage: "Platform not found.",
    });
  }

  const state = encodeURIComponent(randomBytes(25).toString("hex"));
  const cookieName = getStateCookieName(state);
  console.log("Generated state:", state);
  console.log("State cookie name:", cookieName);

  setCookie(event, cookieName, params.iss, {
    httpOnly: true,
    maxAge: 60 * 1000,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  const nonce = encodeURIComponent(
    [...Array(25)].map(() => ((Math.random() * 36) | 0).toString(36)).join("")
  );
  console.log("Generated nonce:", nonce);

  const authRequestQuery = {
    response_type: "id_token",
    response_mode: "form_post",
    id_token_signed_response_alg: "RS256",
    scope: "openid",
    client_id: params.client_id,
    redirect_uri: params.target_link_uri,
    login_hint: params.login_hint,
    nonce,
    prompt: "none",
    state,
    lti_message_hint: params.lti_message_hint,
    lti_deployment_id: params.lti_deployment_id,
  };

  console.log("Authorization request query:", authRequestQuery);

  const url = new URL(platform.authenticationEndpoint);
  url.search = new URLSearchParams(authRequestQuery).toString();

  console.log("Redirecting to:", url.href);

  return sendRedirect(event, url.href);
});
