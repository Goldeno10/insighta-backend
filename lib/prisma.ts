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
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;