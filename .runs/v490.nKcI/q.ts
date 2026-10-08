import { drizzle } from "drizzle-orm/pg-proxy";
import { getTableColumns, eq } from "drizzle-orm";
import { projects } from "@/db/schema";
const REPORT_PROJECT_COLUMNS = {
  id:                       projects.id,
  clientName:               projects.clientName,
  websiteUrl:               projects.websiteUrl,
  industry:                 projects.industry,
  kwVolThresholdClient:     projects.kwVolThresholdClient,
  kwVolThresholdCompetitor: projects.kwVolThresholdCompetitor,
  brandTerms:               projects.brandTerms,
  excludedBrands:           projects.excludedBrands,
  scopeOverrides:           projects.scopeOverrides,
  hiddenCategories:         projects.hiddenCategories,
  profoundData:             projects.profoundData,
  productInsights:          projects.productInsights,
  productInsightsUpdatedAt: projects.productInsightsUpdatedAt,
  insightsPanel:            projects.insightsPanel,
  authoritySnapshot:        projects.authoritySnapshot,
};
const db = drizzle(async () => ({ rows: [] }));
const q = db.select(REPORT_PROJECT_COLUMNS).from(projects).where(eq(projects.id, "x")).toSQL().sql;
const cols = getTableColumns(projects);
const jsonb = Object.entries(cols).filter(([,c]) => (c as any).columnType === "PgJsonb").map(([,c]) => (c as any).name);
const inSql = (n: string) => new RegExp("\\b"+n+"\\b").test(q);
const readStores = ["brand_terms","excluded_brands","scope_overrides","hidden_categories","profound_data","product_insights","insights_panel","authority_snapshot"];
const unreadStores = jsonb.filter(n => readStores.indexOf(n) === -1);
const needScalars = ["client_name","website_url","industry","kw_vol_threshold_client","kw_vol_threshold_competitor"];
console.log(JSON.stringify({ hasObj: true, sql: q, jsonbCount: jsonb.length, jsonbNames: jsonb,
  readMissing: readStores.filter(n => !inSql(n)), unreadPresent: unreadStores.filter(inSql),
  scalarMissing: needScalars.filter(n => !inSql(n)),
  keys: Object.keys(REPORT_PROJECT_COLUMNS) }));
