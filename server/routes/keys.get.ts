import Jwk from "rasha";
import { getPublicKeys } from "../storage/publicKey";

export default defineEventHandler(async () => {
  const publickeys = await getPublicKeys();
  console.log(publickeys);
  const pKeys = (publickeys as any[]).map(async (key) => {
    const jwk = await Jwk.import({ pem: key.public_key, public: true });
    return { ...jwk, kid: `${key.kid}`, alg: "RS256", use: "sig" };
  });
  const keys = await Promise.all(pKeys);
  return { keys };
});
