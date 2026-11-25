// Generates /sitemap.xml and /robots.txt once `url` is set in src/_data/site.json.
export const data = {
  pagination: { data: "files", size: 1, alias: "file" },
  files: ["sitemap.xml", "robots.txt"],
  permalink: (data) => (data.site.url ? `/${data.file}` : false),
  eleventyExcludeFromCollections: true,
};

export function render({ file, site, collections }) {
  if (file === "robots.txt") {
    return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
  }
  const urls = collections.all
    .filter((p) => p.url && !p.data.eleventyExcludeFromCollections && !p.url.endsWith(".html"))
    .map((p) => `  <url><loc>${site.url}${p.url}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
