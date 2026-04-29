import "dotenv/config";
import path from "path";
import type { PrismaConfig } from "prisma";
import { env } from "prisma/config";

export default {
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  datasource: {
    url: env("DATABASE_URL_UNPOOLED"),
  },
} satisfies PrismaConfig;

// export default {
//   schema: "prisma/schema.prisma",
//   migrations: {
//     path: "prisma/migrations",
//     seed: "tsx prisma/seed.ts",
//   },
//   datasource: {
//     url: env("DATABASE_URL_UNPOOLED"),
//   },
// } satisfies PrismaConfig;