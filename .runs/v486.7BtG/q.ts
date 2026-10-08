import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableColumns, eq, desc } from "drizzle-orm";
import { projects } from "@/db/schema";
const LIST_COLUMNS = {
  id:                       projects.id,
  clientName:               projects.clientName,
  websiteUrl:               projects.websiteUrl,
  industry:                 projects.industry,
  notes:                    projects.notes,
  status:                   projects.status,
  dataSource:               projects.dataSource,
  kwVolThresholdClient:     projects.kwVolThresholdClient,
  kwVolThresholdCompetitor: projects.kwVolThresholdCompetitor,
  semrushDatabase:          projects.semrushDatabase,
  createdAt:                projects.createdAt,
  updatedAt:                projects.updatedAt,
};
const db = drizzle(async () => ({ rows: [] }));
const q = db.select(LIST_COLUMNS).from(projects).where(eq(projects.status, "active")).orderBy(desc(projects.createdAt)).toSQL().sql;
const cols = getTableColumns(projects);
const jsonb = Object.entries(cols).filter(([,c]) => (c as any).columnType === "PgJsonb").map(([,c]) => (c as any).name);
const need = ["id","client_name","website_url","industry","status","updated_at"];
console.log(JSON.stringify({ hasObj: true, sql: q, jsonbCount: jsonb.length, jsonbInSql: jsonb.filter(n => new RegExp("\\b"+n+"\\b").test(q)), needMissing: need.filter(n => !new RegExp("\\b"+n+"\\b").test(q)), star: /select \*|select \"projects\"\.\"profound_data\"/i.test(q) }));
