import "dotenv/config";
import { createSessionToken } from "../lib/server/auth";
const uid = process.argv[2];
if (!uid) { console.error("usage: mint-session <userId>"); process.exit(1); }
console.log(await createSessionToken(uid));
