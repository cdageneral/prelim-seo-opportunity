import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Lazy initialization — defer DB connection until first request.
// Throwing at module load time causes Next.js build to fail during
// "Collecting page data" because DATABASE_URL isn't available at build time.
type DbType = ReturnType<typeof drizzle<typeof schema>>;

let _instance: DbType | undefined;

function getInstance(): DbType {
  if (_instance) return _instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is not set');
  // v7.562: every query goes to the database, never Next.js's fetch cache. neon-http
  // speaks over fetch(); without no-store, an identical query in a GET route could be
  // answered from cache, which froze the API Usage "All time" totals (moved/new rows
  // never showed until the query text changed, e.g. by picking a date range).
  _instance = drizzle(neon(url, { fetchOptions: { cache: 'no-store' } }), { schema });
  return _instance;
}

export const db = new Proxy({} as DbType, {
  get(_, prop) {
    return Reflect.get(getInstance(), prop);
  },
});

export * from './schema';
