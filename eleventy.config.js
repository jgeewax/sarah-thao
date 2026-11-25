import path from "node:path";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

export default function (eleventyConfig) {
  // Every <img> in the output is turned into a responsive <picture> (WebP + JPEG, several sizes).
  // Add `eleventy:ignore` to an <img> to opt out.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp", "jpeg"],
    widths: [480, 800, 1200, 1800],
    urlPath: "/img/",
    outputDir: path.join(eleventyConfig.directories.output, "img"),
    sharpJpegOptions: { quality: 82, mozjpeg: true },
    sharpWebpOptions: { quality: 80 },
    htmlOptions: {
      imgAttributes: { loading: "lazy", decoding: "async" },
    },
  });

  // Rewrites root-relative URLs when the site lives in a sub-folder (e.g. username.github.io/repo/).
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy("src/assets");
  // Original, full-resolution photos are kept for the zoom view.
  eleventyConfig.addPassthroughCopy("src/artworks/**/*.{jpg,jpeg,png,webp}");

  // All artworks, in the order set by `order:` in each file (lowest first).
  eleventyConfig.addCollection("artworks", (api) =>
    api
      .getFilteredByGlob("src/artworks/*/index.md")
      .sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999)),
  );

  eleventyConfig.addFilter("where", (items, key, value) =>
    (items || []).filter((item) => item.data[key] === value),
  );
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
