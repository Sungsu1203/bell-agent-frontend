import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack workspace root 명시 — 형제 폴더(frontend_my_files 등)가 있는
  // D:\Bell_Agent 를 root 로 오판하여 tailwindcss 해석이 실패하는 것 방지.
  // 자세한 박제: README-dev.md §12-15
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
