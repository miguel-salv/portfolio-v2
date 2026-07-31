import type { APIRoute } from "astro";
import { projectList } from "../data/projects";

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error("Astro.site must be configured");
  const routes = ["/", ...projectList.map((project) => project.route)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${new URL(route, site).href}</loc></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
