import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AUTEUR Studio",
    short_name: "AUTEUR",
    description: "Local-first AI production workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#090a0c",
    theme_color: "#090a0c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
