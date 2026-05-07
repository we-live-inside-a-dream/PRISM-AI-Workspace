import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7 uses a driver adapter (@prisma/adapter-better-sqlite3 + the
  // native better-sqlite3 binding). Keep those out of Next's bundle so they
  // resolve at runtime against node_modules — otherwise Turbopack tries to
  // bundle a .node addon and fails.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],

  images: {
    // Allow <Image> to render GitHub avatars (shown in the sidebar).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
