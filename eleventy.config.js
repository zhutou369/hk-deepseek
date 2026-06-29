function isPostIndexable(data, inputPath) {
  if (data.noindex === true) return false;
  if (data.featured === true) return true;
  if (data.generated === true) return false;

  const path = inputPath || "";
  if (/\/posts\/\d{4}-\d{2}-\d{2}-post-\d+-\d+\.md$/i.test(path)) return false;

  const desc = data.description || "";
  const title = data.title || "";
  const tags = Array.isArray(data.tags) ? data.tags : [];

  if (desc.includes("專業技術解析與香港本地化實操指南")) return false;
  if (/官方|權威|站群|SEOer|友鏈|友链|跨境流量|免翻牆|爆款文案|搞掂友鏈|全攻略|爽歪歪|產業智能集成|重塑產業邊界/.test(title)) return false;
  if (/SEOer|自動檢測\+對接|狂降\d+%/.test(title)) return false;
  if (/實戰帖|小夥伴們注意|手把手教你/.test(desc)) return false;
  if (tags.includes("SEO優化")) return false;

  return true;
}

module.exports = function (eleventyConfig) {
  const systemTags = new Set(["all", "posts", "post", "nav", "eleventyNavigation"]);

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/static");
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy("src/images.txt");
  eleventyConfig.addPassthroughCopy("src/ai1");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy({ "src/*.txt": "/" });

  eleventyConfig.addGlobalData("eleventyComputed", {
    noindex: (data) => {
      if (data.noindex === true) return true;
      const inputPath = data.page?.inputPath || "";
      if (inputPath.includes("/tags/") || inputPath.endsWith("tags.njk") || inputPath.endsWith("tag-list.njk")) {
        return true;
      }
      if (!inputPath.includes("posts")) return false;
      return !isPostIndexable(data, inputPath);
    }
  });

  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md").sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("indexablePosts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .filter((item) => isPostIndexable(item.data, item.inputPath))
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("homepagePosts", function (collectionApi) {
    const posts = collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .filter((item) => isPostIndexable(item.data, item.inputPath));
    const pillars = posts
      .filter((item) => !/\/\d{4}-\d{2}-\d{2}-post-/.test(item.inputPath))
      .sort((a, b) => a.inputPath.localeCompare(b.inputPath, "zh-HK"));
    const featured = posts
      .filter((item) => /\/\d{4}-\d{2}-\d{2}-post-/.test(item.inputPath))
      .sort((a, b) => b.date - a.date);
    return [...pillars, ...featured].slice(0, 8);
  });

  eleventyConfig.addCollection("tagList", function (collectionApi) {
    const tagSet = new Set();
    collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .filter((item) => isPostIndexable(item.data, item.inputPath))
      .forEach((item) => {
        const tags = Array.isArray(item.data.tags) ? item.data.tags : [];
        tags.forEach((tag) => {
          const normalizedTag = String(tag || "").trim();
          if (normalizedTag && !systemTags.has(normalizedTag)) {
            tagSet.add(normalizedTag);
          }
        });
      });
    return [...tagSet].sort((a, b) => a.localeCompare(b, "zh-HK"));
  });

  eleventyConfig.addFilter("limit", function (arr, limit) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, limit);
  });

  eleventyConfig.addFilter("postsByTag", function (posts, tag) {
    if (!Array.isArray(posts)) return [];
    return posts.filter((post) => {
      if (!isPostIndexable(post.data, post.inputPath)) return false;
      const tags = Array.isArray(post.data.tags) ? post.data.tags : [];
      return tags.includes(tag);
    });
  });

  eleventyConfig.addFilter("tagSlug", function (tag) {
    return encodeURIComponent(String(tag || "").trim());
  });

  eleventyConfig.addFilter("dateFilter", function (dateValue) {
    if (!dateValue) return "";
    const d = new Date(dateValue);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}年${month}月${day}日`;
  });

  eleventyConfig.addFilter("htmlDate", function (dateValue) {
    if (!dateValue) return "";
    return new Date(dateValue).toISOString().slice(0, 10);
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site"
    },
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
