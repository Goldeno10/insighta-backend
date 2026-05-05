// // import { PrismaClient } from "./generated/prisma/client.js";

// // declare global {
// //   var prisma: PrismaClient | undefined;
// // }

// // let prisma: PrismaClient;

// // if (process.env.NODE_ENV === 'production') {
// //   prisma = new PrismaClient({});
// // } else {
// //   if (!global.prisma) {
// //     global.prisma = new PrismaClient({});
// //   }
// //   prisma = global.prisma;
// // }

// // export default prisma;

// import { PrismaClient } from "./generated/prisma/client"; 
// import { PrismaPg } from "@prisma/adapter-pg"; 

// const globalForPrisma = global as unknown as {
//   prisma: PrismaClient; 
// }; 
// const adapter = new PrismaPg({
//   connectionString: process.env.DATABASE_URL_UNPOOLED,
//   ssl: true,
// }); 
// const prisma =
//   globalForPrisma.prisma ||
//   new PrismaClient({
//     adapter, 
//   }); 
// if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma; 
// export default prisma; 


import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function isLikelyLocalPostgres(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("0.0.0.0") ||
    url.includes("host.docker.internal")
  );
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");

  const forceNeon = process.env.DATABASE_PROVIDER === "neon";
  const forcePg = process.env.DATABASE_PROVIDER === "pg";

  const useLocalPg =
    forcePg ||
    (!forceNeon && process.env.NODE_ENV !== "production" && isLikelyLocalPostgres(url));

  const adapter = useLocalPg
    ? new PrismaPg({
        connectionString: url,
        ssl: false,
      })
    : new PrismaNeon({
        connectionString: url,
      });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;