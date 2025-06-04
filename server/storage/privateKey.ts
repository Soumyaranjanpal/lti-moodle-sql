import { getConnection } from "~/dbScripts/db";

export default function usePrivateKeyStorage() {
  return useStorage<string>("privateKey");
}

export async function getPrivateKey(kid: string) {
  const connection = await getConnection();

  const [rows] = await connection.execute(
    `SELECT 
      private_key
     FROM platforms
     WHERE kid= ?`,
    [kid]
  );

  if ((rows as any[]).length === 0) {
    return null;
  }

  const row = (rows as any)[0];

  // Reconstruct the platform object structure like your storage version
  return row.private_key;
}
