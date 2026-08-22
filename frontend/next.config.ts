import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silences a spurious lockfile-resolution warning: an unrelated
  // package-lock.json exists above the git repo root on this machine.
  // Pinning the workspace root to this app avoids Next.js scanning upward.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
