import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "ynottcg.com",
          },
        ],
        destination: "https://www.ynottcg.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
