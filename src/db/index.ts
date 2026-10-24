import { neon } from "@neondatabase/serverless";
import { parseEnv } from "@neon/env";
import { drizzle } from "drizzle-orm/neon-http";

import neonConfig from "../../neon";

const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"]);

export const db = drizzle({ client: neon(postgres.databaseUrl) });
