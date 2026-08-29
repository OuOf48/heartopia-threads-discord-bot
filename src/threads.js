import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const DEFAULT_PROFILE_ORIGIN = "https://www.threads.com";

function uniqueImageUrls(values) {
  const unique = new Map();
  for (const value of values) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      // Threads often exposes the same CDN file twice: a small DOM rendition
      // and a full-size Open Graph rendition. The pathname identifies the
      // underlying media while the query string only changes its rendition.
      const key =
        hostname.endsWith(".cdninstagram.com") || hostname.endsWith(".fbcdn.net")
          ? url.pathname
          : url.href;
      unique.set(key, value);
    } catch {
      // Ignore malformed media candidates from the page.
    }
  }
  return [...unique.values()];
}

function normalizeUsername(value) {
  const username = String(value ?? "").trim().replace(/^@/u, "");
  if (!/^[A-Za-z0-9._]{1,64}$/u.test(username)) {
    throw new Error("THREADS_USERNAME 格式不正確。");
  }
  return username;
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const bundledPath = chromium.executablePath();
  if (bundledPath && existsSync(bundledPath)) return bundledPath;

  throw new Error(
    "找不到 Chrome/Chromium。GitHub Actions 會自動指定系統 Chrome；本機執行時請設定 CHROME_PATH。",
  );
}

/** This function runs inside the Threads page. Keep it browser-compatible. */
function collectPostCards({ username, origin }) {
  const normalizedUsername = username.toLowerCase();
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const exactPostPath = new RegExp(`^/@${escapedUsername}/post/([^/]+)$`, "iu");
  const anchors = Array.from(document.querySelectorAll('a[href*="/post/"]'));
  const posts = [];

  function postImageUrls(container, postId) {
    const urls = [];
    for (const image of container.querySelectorAll("img")) {
      const rectangle = image.getBoundingClientRect();
      // Profile avatars and small UI icons are below this size. Post media
      // retains its layout dimensions even while network image requests are
      // blocked, so URLs can be collected without downloading every image.
      if (rectangle.width < 160 || rectangle.height < 160) continue;
      const mediaLink = image.closest('a[href*="/post/"]');
      if (mediaLink) {
        try {
          const mediaUrl = new URL(mediaLink.getAttribute("href"), origin);
          const mediaMatch = mediaUrl.pathname.match(/^\/@[^/]+\/post\/([^/]+)(?:\/media)?$/iu);
          if (mediaMatch && mediaMatch[1] !== postId) continue;
        } catch {
          continue;
        }
      }
      const source = image.currentSrc || image.getAttribute("src");
      if (!source || !/^https:\/\//iu.test(source)) continue;
      urls.push(source);
    }
    return [...new Set(urls)];
  }

  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref) continue;

    let url;
    try {
      url = new URL(rawHref, origin);
    } catch {
      continue;
    }

    const match = url.pathname.match(exactPostPath);
    if (!match) continue; // Ignores /media and other subroutes.

    let container = anchor;
    for (let depth = 0; container && depth < 12; depth += 1, container = container.parentElement) {
      const candidateText = (container.innerText || "").trim();
      const lines = candidateText.split(/\n/u).filter(Boolean);
      const containsAuthor = candidateText.toLowerCase().includes(normalizedUsername);
      const containsBody = lines.length >= 4 && candidateText.length > username.length + 24;
      if (containsAuthor && containsBody) break;
    }

    if (!container) continue;
    const timeElement = anchor.querySelector("time") || container.querySelector(`a[href="${url.pathname}"] time`);
    posts.push({
      id: match[1],
      url: `${origin}${url.pathname}`,
      text: (container.innerText || "").trim(),
      publishedAt: timeElement?.getAttribute("datetime") || null,
      imageUrls: postImageUrls(container, match[1]),
    });
  }

  // Media and nested quote links may produce duplicates. Prefer the richest
  // text container for a post and preserve the profile's newest-first order.
  const deduplicated = new Map();
  for (const post of posts) {
    const previous = deduplicated.get(post.id);
    if (!previous) {
      deduplicated.set(post.id, post);
      continue;
    }

    const richer = post.text.length > previous.text.length ? post : previous;
    deduplicated.set(post.id, {
      ...richer,
      imageUrls: [...new Set([...previous.imageUrls, ...post.imageUrls])],
    });
  }

  return Array.from(deduplicated.values());
}

export async function fetchThreadsPosts(usernameInput, options = {}) {
  const username = normalizeUsername(usernameInput);
  const origin = options.origin || DEFAULT_PROFILE_ORIGIN;
  const executablePath = options.executablePath || resolveChromeExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--lang=zh-TW"],
  });

  try {
    const context = await browser.newContext({
      locale: "zh-TW",
      timezoneId: "Asia/Taipei",
      viewport: { width: 1280, height: 1400 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Profile scans only need text, so skip heavy assets. Exact-post requests
    // are rare and keep images enabled so every item in a carousel is present
    // in the DOM before its signed CDN URL is collected.
    await page.route("**/*", async (route) => {
      const type = route.request().resourceType();
      if (["media", "font"].includes(type) || (type === "image" && !options.postId)) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    const targetUrl = options.postId
      ? `${origin}/@${username}/post/${encodeURIComponent(options.postId)}`
      : `${origin}/@${username}`;
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`a[href^="/@${username}/post/"]`, { timeout: 35_000 });
    await page.waitForTimeout(2_500);

    // A small scroll prompts lazy-loaded profile cards without loading the
    // account's full history.
    if (!options.postId) {
      await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 900)));
      await page.waitForTimeout(1_500);
    }

    const posts = await page.evaluate(collectPostCards, { username, origin });
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new Error("Threads 公開頁面沒有讀到任何貼文，可能暫時限流或版面已更新。");
    }

    if (options.postId) {
      const targetPost = posts.find((post) => post.id === options.postId);
      if (!targetPost) {
        throw new Error(`Threads 找不到指定貼文：${options.postId}`);
      }

      const openGraphImages = await page.evaluate(() =>
        Array.from(document.querySelectorAll('meta[property="og:image"]'))
          .map((element) => element.getAttribute("content"))
          .filter((value) => value && /^https:\/\//iu.test(value)),
      );
      targetPost.imageUrls = uniqueImageUrls([...targetPost.imageUrls, ...openGraphImages]);
      return [targetPost];
    }

    return posts;
  } finally {
    await browser.close();
  }
}

export async function fetchThreadsPost(username, postId, options = {}) {
  const normalizedPostId = String(postId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{5,64}$/u.test(normalizedPostId)) {
    throw new Error("Threads 貼文 ID 格式不正確。");
  }
  const posts = await fetchThreadsPosts(username, { ...options, postId: normalizedPostId });
  return posts[0];
}

export { collectPostCards, uniqueImageUrls };
