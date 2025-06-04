import { getConnection } from "~/dbScripts/db";

export default function usePublicKeyStorage() {
  return useStorage<string>("publicKey");
}

export async function getPublicKeys() {
  const connection = await getConnection();

  const [rows] = await connection.execute(
    `SELECT 
      public_key,kid
     FROM platforms
     `,
    []
  );

  if ((rows as any[]).length === 0) {
    return [];
  }
  console.log(rows);
  return rows;
}
