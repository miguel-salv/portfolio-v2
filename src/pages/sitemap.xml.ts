import type { APIRoute } from "astro";
import { projectList } from "../data/projects";
import { site } from "../data/site";

export const GET: APIRoute = () => {
  const routes = ["/", ...projectList.map((project) => project.route)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${new URL(route, site.url).href}</loc></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
