import path from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project so Turbopack doesn't infer it from an
  // unrelated lockfile elsewhere on disk (e.g. a global one in the user's home directory).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
