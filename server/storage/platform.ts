import { getConnection } from "~/dbScripts/db";
import { Platform } from "../types/platform";

export async function getPlatform(platformUrl: string, clientId: string) {
  const connection = await getConnection();

  const [rows] = await connection.execute(
    `SELECT 
      url, name, client_id, authentication_endpoint,
      accesstoken_endpoint, auth_method, auth_key, kid
     FROM platforms
     WHERE url = ? AND client_id = ?`,
    [platformUrl, clientId]
  );

  if ((rows as any[]).length === 0) {
    return null;
  }

  const row = (rows as any)[0];

  // Reconstruct the platform object structure like your storage version
  return {
    url: row.url,
    name: row.name,
    clientId: row.client_id,
    authenticationEndpoint: row.authentication_endpoint,
    accesstokenEndpoint: row.accesstoken_endpoint,
    authConfig: {
      method: row.auth_method,
      key: row.auth_key,
    },
    kid: row.kid,
  } as Platform;
}
