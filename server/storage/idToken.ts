import { getConnection } from "~/dbScripts/db";
import { IDTokenPayload } from "../types/idToken";

export function getIDTokenStorageKey({
  issuer,
  clientId,
  deploymentId,
  userId,
}: {
  issuer: string;
  clientId: string;
  deploymentId: string;
  userId: string;
}) {
  return `${issuer}:${clientId}:${deploymentId}:${userId}`;
}

export default function useIDTokenStorage() {
  return useStorage<IDTokenPayload>("idToken");
}
export async function storeIDToken(payload: IDTokenPayload) {
  const connection = await getConnection();

  const issuer = payload.iss;
  const clientId =
    typeof payload.aud === "string" ? payload.aud : payload.aud[0];
  const userId = payload.sub;
  const deploymentId =
    payload["https://purl.imsglobal.org/spec/lti/claim/deployment_id"];

  if (!issuer || !clientId || !deploymentId || !userId) {
    throw new Error("Missing required fields in ID token payload.");
  }

  console.log("[storeIDToken] Storing ID token with the following details:");
  console.log("  Issuer:", issuer);
  console.log("  Client ID:", clientId);
  console.log("  Deployment ID:", deploymentId);
  console.log("  User ID:", userId);

  try {
    const [result]: any = await connection.execute(
      `INSERT INTO id_tokens (
        issuer, client_id, deployment_id, user_id, payload
      ) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        payload = VALUES(payload),
        created_at = CURRENT_TIMESTAMP`,
      [issuer, clientId, deploymentId, userId, JSON.stringify(payload)]
    );

    if (result.affectedRows === 0) {
      console.error("[storeIDToken] No rows were affected.");
      throw new Error("Failed to insert or update ID token.");
    }

    if (result.insertId) {
      console.log("[storeIDToken] Token inserted with ID:", result.insertId);
    } else {
      console.log("[storeIDToken] Token updated for user:", userId);
    }
  } catch (err) {
    console.error("[storeIDToken] Error storing ID token:", err);
    throw new Error("Database operation failed while storing ID token.");
  }
}

export async function getIDToken({
  issuer,
  clientId,
  deploymentId,
  userId,
}: {
  issuer: string;
  clientId: string;
  deploymentId: string;
  userId: string;
}): Promise<IDTokenPayload | null> {
  const connection = await getConnection();

  const [rows] = await connection.execute(
    `SELECT payload FROM id_tokens
     WHERE issuer = ? AND client_id = ? AND deployment_id = ? AND user_id = ?`,
    [issuer, clientId, deploymentId, userId]
  );

  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0] as { payload: any };
    return typeof row.payload === "string"
      ? (JSON.parse(row.payload) as IDTokenPayload)
      : (row.payload as IDTokenPayload);
  }

  return null;
}
