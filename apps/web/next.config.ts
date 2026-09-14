import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const sensitiveLinkHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/reset-password/:token", headers: sensitiveLinkHeaders },
      { source: "/invite/:token", headers: sensitiveLinkHeaders },
    ];
  },
};

export default nextConfig;
