import { sql } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { usersTable } from "@/db/schema";

export async function DatabaseStatus() {
  try {
    const nowRows = await db.execute<{ now: string }>(
      sql`select now()::text as now`,
    );
    const userCount = await db.$count(usersTable);

    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <Badge variant="secondary">Postgres connected</Badge>
        <span>
          Branch {process.env.NEON_BRANCH ?? "unknown"} · {userCount} users ·{" "}
          {nowRows.rows[0]?.now ?? "now unavailable"}
        </span>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <Badge variant="destructive">Postgres unavailable</Badge>
        <span>{message}</span>
      </div>
    );
  }
}
