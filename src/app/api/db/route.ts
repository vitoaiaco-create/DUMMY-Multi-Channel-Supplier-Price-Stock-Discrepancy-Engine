import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { usersTable } from "@/db/schema";

export const dynamic = "force-dynamic";

const PROBE_EMAIL = "neon-setup-probe@miloto.local";

export async function GET() {
  try {
    const nowRows = await db.execute<{ now: string }>(
      sql`select now()::text as now`,
    );
    const now = nowRows.rows[0]?.now ?? null;

    await db.delete(usersTable).where(eq(usersTable.email, PROBE_EMAIL));
    await db.insert(usersTable).values({
      name: "Neon setup probe",
      age: 1,
      email: PROBE_EMAIL,
    });

    const [probe] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.email, PROBE_EMAIL));

    await db.delete(usersTable).where(eq(usersTable.email, PROBE_EMAIL));

    return Response.json({
      ok: true,
      service: "postgres",
      branch: process.env.NEON_BRANCH ?? null,
      now,
      wrote: true,
      read: probe ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, service: "postgres", error: message }, { status: 500 });
  }
}
