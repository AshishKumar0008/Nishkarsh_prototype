import { PrismaClient, type Prisma } from '@prisma/client';
import { normaliseDatabaseUrl } from './dbUrl';

const url = normaliseDatabaseUrl(process.env.DATABASE_URL);
export const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();

/** Transaction client — pass this through every function that writes as part of one workflow step. */
export type Tx = Prisma.TransactionClient;
