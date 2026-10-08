import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableColumns } from "drizzle-orm";
import { projects, analyses } from "@/db/schema";
const db = drizzle(async () => ({ rows: [] }));
const out: any[] = [];
out.push({ key: "brand", tbl: "projects", sql: db.select({ id: projects.id, clientName: projects.clientName, websiteUrl: projects.websiteUrl }).from(projects).toSQL().sql });
out.push({ key: "excl", tbl: "projects", sql: db.select({ id: projects.id, clientName: projects.clientName, websiteUrl: projects.websiteUrl }).from(projects).toSQL().sql });
out.push({ key: "auth", tbl: "projects", sql: db.select({ snapshot: projects.authoritySnapshot, updatedAt: projects.authoritySnapshotUpdatedAt }).from(projects).toSQL().sql });
out.push({ key: "auth", tbl: "projects", sql: db.select({
      id:              projects.id,
      clientName:      projects.clientName,
      websiteUrl:      projects.websiteUrl,
      semrushDatabase: projects.semrushDatabase,
      // the scan compares against the PRIOR snapshot before writing a new one
      // (two read sites further down), so this one store has to travel.
      authoritySnapshot: projects.authoritySnapshot,
    }).from(projects).toSQL().sql });
out.push({ key: "serp", tbl: "projects", sql: db.select({ id: projects.id, websiteUrl: projects.websiteUrl, semrushDatabase: projects.semrushDatabase }).from(projects).toSQL().sql });
out.push({ key: "clear", tbl: "analyses", sql: db.select({ id: analyses.id, semrushSnapshot: analyses.semrushSnapshot }).from(analyses).toSQL().sql });
const jb = (t: any) => Object.values(getTableColumns(t)).filter((c: any) => c.columnType === "PgJsonb").map((c: any) => c.name);
const pcols = getTableColumns(projects) as any;
const acols = getTableColumns(analyses) as any;
console.log(JSON.stringify({ out: out, projJsonb: jb(projects), anaJsonb: jb(analyses),
  projHasSemrushSnapshot: Object.keys(pcols).indexOf("semrushSnapshot") !== -1,
  anaHasSemrushSnapshot:  Object.keys(acols).indexOf("semrushSnapshot") !== -1 }));
