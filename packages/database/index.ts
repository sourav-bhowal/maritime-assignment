import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL is not set");
}
const prismaClientSingleton = () => {
  const adapter = new PrismaPg({
    connectionString: dbUrl,
  });

  return new PrismaClient({ adapter });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Ensure Prisma only runs on the server side
if (typeof window !== "undefined") {
  throw new Error("PrismaClient should not be used on the client side");
}

export const prisma: ReturnType<typeof prismaClientSingleton> =
  globalThis.prismaGlobal ?? prismaClientSingleton();

// In development, cache the Prisma client instance in the globalThis object
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export * from "./generated/prisma/client.js";
