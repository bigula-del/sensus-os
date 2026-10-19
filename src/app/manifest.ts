import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sensus OS",
    short_name: "Sensus",
    description: "Sensus Travel DMC management platform",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0B0A",
    theme_color: "#0B0B0A",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
