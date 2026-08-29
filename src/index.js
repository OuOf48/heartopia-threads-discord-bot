import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildResourceMessage, buildTestMessage, sendDiscordMessage } from "./discord.js";
import { extractHeartopiaResources } from "./extract.js";
import { loadState, rememberPost, saveState } from "./state.js";
import { fetchThreadsPosts } from "./threads.js";

const DEFAULT_STATE_PATH = fileURLToPath(new URL("../data/state.json", import.meta.url));

function readMode() {
  const argument = process.argv.find((value) => value.startsWith("--mode="));
  const mode = argument?.split("=")[1] || process.env.RUN_MODE || "monitor";
  if (!["monitor", "dry-run", "discord-test"].includes(mode)) {
    throw new Error(`不支援的模式：${mode}`);
  }
  return mode;
}

function config() {
  return {
    mode: readMode(),
    username: String(process.env.THREADS_USERNAME || "oorainielove520oo")
      .trim()
      .replace(/^@/u, ""),
    channelId: String(process.env.DISCORD_CHANNEL_ID || "").trim(),
    botToken: String(process.env.DISCORD_BOT_TOKEN || "").trim(),
    statePath: resolve(process.env.STATE_PATH || DEFAULT_STATE_PATH),
  };
}

async function runDiscordTest(settings) {
  await sendDiscordMessage({
    token: settings.botToken,
    channelId: settings.channelId,
    payload: buildTestMessage(),
  });
  console.log("Discord 測試訊息已成功送出。");
}

function matchingPosts(posts) {
  return posts
    .map((post) => ({ post, resource: extractHeartopiaResources(post.text) }))
    .filter(({ resource }) => resource);
}

async function runDryRun(settings) {
  const posts = await fetchThreadsPosts(settings.username);
  const matches = matchingPosts(posts);
  console.log(
    JSON.stringify(
      {
        fetchedPostCount: posts.length,
        matchingPostCount: matches.length,
        latestMatch: matches[0]
          ? {
              id: matches[0].post.id,
              url: matches[0].post.url,
              publishedAt: matches[0].post.publishedAt,
              extracted: matches[0].resource,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

async function sendResource(settings, post, resource) {
  const payload = buildResourceMessage({ username: settings.username, post, resource });
  await sendDiscordMessage({
    token: settings.botToken,
    channelId: settings.channelId,
    payload,
  });
  console.log(`已發布：${resource.resourceLine} (${post.url})`);
}

async function runMonitor(settings) {
  const posts = await fetchThreadsPosts(settings.username);
  let state = await loadState(settings.statePath);
  const seen = new Set(state.seenPostIds);

  if (!state.initialized) {
    const latestMatch = matchingPosts(posts)[0];
    if (latestMatch) {
      await sendResource(settings, latestMatch.post, latestMatch.resource);
    } else {
      console.log("第一次執行未找到符合條件的資源貼文，先建立追蹤基準。");
    }

    for (const post of posts) state = rememberPost(state, post.id);
    state.initialized = true;
    state.lastSuccessfulCheck = new Date().toISOString();
    await saveState(settings.statePath, state);
    return;
  }

  // Profile order is newest first; Discord should receive multiple missed posts
  // from oldest to newest after an outage.
  const unseenPosts = posts.filter((post) => !seen.has(post.id)).reverse();
  for (const post of unseenPosts) {
    const resource = extractHeartopiaResources(post.text);
    if (resource) await sendResource(settings, post, resource);
    state = rememberPost(state, post.id);
  }

  state.lastSuccessfulCheck = new Date().toISOString();
  await saveState(settings.statePath, state);
  console.log(
    unseenPosts.length === 0
      ? `檢查完成：沒有新貼文（共讀取 ${posts.length} 篇）。`
      : `檢查完成：處理 ${unseenPosts.length} 篇新貼文。`,
  );
}

async function main() {
  const settings = config();
  if (settings.mode === "discord-test") return runDiscordTest(settings);
  if (settings.mode === "dry-run") return runDryRun(settings);
  return runMonitor(settings);
}

main().catch((error) => {
  console.error(`執行失敗：${error?.message || error}`);
  process.exitCode = 1;
});

