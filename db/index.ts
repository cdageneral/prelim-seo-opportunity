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
  _instance = drizzle(neon(url), { schema });
  return _instance;
}

export const db = new Proxy({} as DbType, {
  get(_, prop) {
    return Reflect.get(getInstance(), prop);
  },
});

export * from './schema';
