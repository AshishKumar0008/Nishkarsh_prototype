import { PrismaClient, type Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

/** Transaction client — pass this through every function that writes as part of one workflow step. */
export type Tx = Prisma.TransactionClient;
