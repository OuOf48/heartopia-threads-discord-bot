import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const DEFAULT_PROFILE_ORIGIN = "https://www.threads.com";

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
    });
  }

  // Media and nested quote links may produce duplicates. Prefer the richest
  // text container for a post and preserve the profile's newest-first order.
  const deduplicated = new Map();
  for (const post of posts) {
    const previous = deduplicated.get(post.id);
    if (!previous || post.text.length > previous.text.length) {
      deduplicated.set(post.id, post);
    }
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

    // Images and videos are unnecessary for text extraction and make scheduled
    // runs slower. Scripts and XHR requests remain enabled.
    await page.route("**/*", async (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    const profileUrl = `${origin}/@${username}`;
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(`a[href^="/@${username}/post/"]`, { timeout: 35_000 });
    await page.waitForTimeout(2_500);

    // A small scroll prompts lazy-loaded profile cards without loading the
    // account's full history.
    await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 900)));
    await page.waitForTimeout(1_500);

    const posts = await page.evaluate(collectPostCards, { username, origin });
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new Error("Threads 公開頁面沒有讀到任何貼文，可能暫時限流或版面已更新。");
    }

    return posts;
  } finally {
    await browser.close();
  }
}

export { collectPostCards };

