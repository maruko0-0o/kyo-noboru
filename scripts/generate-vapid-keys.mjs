import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "jwk" },
});
const base64url = (value) => Buffer.from(value, "base64url");
const publicBytes = Buffer.concat([Buffer.from([4]), base64url(publicKey.x), base64url(publicKey.y)]).toString("base64url");

console.log(`PUSH_VAPID_PUBLIC_KEY=${publicBytes}`);
console.log(`PUSH_VAPID_PRIVATE_KEY=${privateKey.d}`);
console.log("PUSH_VAPID_SUBJECT=mailto:your-email@example.com");
console.log(`PUSH_WEBHOOK_SECRET=${crypto.randomUUID()}`);
