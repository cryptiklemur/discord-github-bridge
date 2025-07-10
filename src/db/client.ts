import { drizzle } from 'drizzle-orm/libsql/node';
import * as schema from './schema.ts';

export const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL!
  },
  schema
});
