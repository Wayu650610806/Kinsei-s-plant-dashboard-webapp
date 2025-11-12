import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Kinsei Plant Dashboard", // ชื่อโปรเจกต์
        short_name: "Kinsei",
        description: "Real-time plant monitoring",
        theme_color: "#ffffff",
        icons: [
          {
            src: "pwa-192x192.png", // สร้างไฟล์ไอคอนนี้ใน public/
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png", // สร้างไฟล์ไอคอนนี้ใน public/
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
