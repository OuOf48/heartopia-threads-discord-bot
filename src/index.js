import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  buildInformationMessage,
  buildResourceMessage,
  buildTestMessage,
  sendDiscordMessage,
} from "./discord.js";
import { extractHeartopiaResources } from "./extract.js";
import { classifyInformation, selectInformationImageUrls } from "./information.js";
import { downloadPostImages } from "./media.js";
import { selectFreshUnseenPosts } from "./monitor.js";
import {
  hasPublication,
  loadState,
  rememberPost,
  rememberPublication,
  saveState,
} from "./state.js";
import { fetchThreadsPost, fetchThreadsPosts } from "./threads.js";

const DEFAULT_STATE_PATH = fileURLToPath(new URL("../data/state.json", import.meta.url));
const DEFAULT_RESOURCE_CHANNEL_ID = "1519592044283170897";
const DEFAULT_UPDATE_CHANNEL_ID = "1519591991950839828";
const DEFAULT_METEOR_CHANNEL_ID = "1519592074972893195";
const DEFAULT_PINK_BUBBLE_CHANNEL_ID = "1525791309871317125";
const DEFAULT_REDEMPTION_CODE_CHANNEL_ID = "1519592016005304430";

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function readMode() {
  const mode = argumentValue("mode") || process.env.RUN_MODE || "monitor";
  if (!["monitor", "dry-run", "discord-test", "backfill"].includes(mode)) {
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
    resourceChannelId: String(
      process.env.DISCORD_CHANNEL_ID || DEFAULT_RESOURCE_CHANNEL_ID,
    ).trim(),
    updateChannelId: String(
      process.env.DISCORD_UPDATE_CHANNEL_ID || DEFAULT_UPDATE_CHANNEL_ID,
    ).trim(),
    meteorChannelId: String(
      process.env.DISCORD_METEOR_CHANNEL_ID || DEFAULT_METEOR_CHANNEL_ID,
    ).trim(),
    pinkBubbleChannelId: String(
      process.env.DISCORD_PINK_BUBBLE_CHANNEL_ID || DEFAULT_PINK_BUBBLE_CHANNEL_ID,
    ).trim(),
    redemptionCodeChannelId: String(
      process.env.DISCORD_REDEMPTION_CODE_CHANNEL_ID || DEFAULT_REDEMPTION_CODE_CHANNEL_ID,
    ).trim(),
    botToken: String(process.env.DISCORD_BOT_TOKEN || "").trim(),
    statePath: resolve(process.env.STATE_PATH || DEFAULT_STATE_PATH),
    backfillPostId: String(
      argumentValue("post-id") || process.env.BACKFILL_POST_ID || "",
    ).trim(),
    backfillCategory: String(
      argumentValue("category") || process.env.BACKFILL_CATEGORY || "",
    ).trim(),
    forceBackfill: /^(?:1|true|yes)$/iu.test(
      String(argumentValue("force") || process.env.BACKFILL_FORCE || ""),
    ),
  };
}

function channelFor(settings, category) {
  if (category === "resource") return settings.resourceChannelId;
  if (category === "recipe") return settings.updateChannelId;
  if (category === "meteor") return settings.meteorChannelId;
  if (category === "pink-bubble") return settings.pinkBubbleChannelId;
  if (category === "redemption-code") return settings.redemptionCodeChannelId;
  throw new Error(`沒有設定情報分類頻道：${category}`);
}

async function runDiscordTest(settings) {
  await sendDiscordMessage({
    token: settings.botToken,
    channelId: settings.resourceChannelId,
    payload: buildTestMessage(),
  });
  console.log("Discord 測試訊息已成功送出。");
}

function matchingPosts(posts) {
  return posts
    .map((post) => ({
      post,
      resource: extractHeartopiaResources(post.text),
      information: classifyInformation(post.text),
    }))
    .filter(({ resource, information }) => resource || information.length > 0);
}

async function runDryRun(settings) {
  const posts = await fetchThreadsPosts(settings.username);
  const matches = matchingPosts(posts);
  console.log(
    JSON.stringify(
      {
        fetchedPostCount: posts.length,
        matchingPostCount: matches.length,
        matches: matches.map(({ post, resource, information }) => ({
          id: post.id,
          url: post.url,
          publishedAt: post.publishedAt,
          imageCount: post.imageUrls?.length || 0,
          resource: resource?.resourceLine || null,
          information: information.map(({ category, title, summary, requireImages }) => ({
            category,
            title,
            summary,
            requireImages,
          })),
        })),
      },
      null,
      2,
    ),
  );
}

function eventsForPost(post) {
  const informationEvents = classifyInformation(post.text).map((information) => ({
    category: information.category,
    information,
  }));
  const resource = extractHeartopiaResources(post.text);
  if (resource) informationEvents.push({ category: "resource", resource });
  return informationEvents;
}

async function mediaFilesFor(settings, post, information) {
  // Open the exact post to collect every image in a carousel. This extra page
  // load occurs only for high-confidence image categories, not every check.
  const detailedPost = post.hasExactMedia
    ? post
    : await fetchThreadsPost(settings.username, post.id);
  const imageUrls = selectInformationImageUrls(detailedPost.imageUrls || [], information);
  return downloadPostImages(imageUrls, post.id);
}

async function processPost(settings, post, state, options = {}) {
  const onlyCategory = options.onlyCategory || null;
  const events = eventsForPost(post).filter(
    (event) => !onlyCategory || event.category === onlyCategory,
  );
  const imageFilesPromises = new Map();

  for (const event of events) {
    if (!options.force && hasPublication(state, post.id, event.category)) continue;

    if (event.category === "resource") {
      const payload = buildResourceMessage({
        username: settings.username,
        post,
        resource: event.resource,
      });
      await sendDiscordMessage({
        token: settings.botToken,
        channelId: channelFor(settings, event.category),
        payload,
      });
      console.log(`已發布資源：${event.resource.resourceLine} (${post.url})`);
    } else {
      let files = [];
      if (event.information.attachImages) {
        if (!imageFilesPromises.has(event.category)) {
          imageFilesPromises.set(
            event.category,
            mediaFilesFor(settings, post, event.information),
          );
        }
        files = await imageFilesPromises.get(event.category);
      }
      if (event.information.requireImages && files.length === 0) {
        throw new Error(`${event.information.title}符合條件，但沒有取得任何貼文圖片。`);
      }

      const payload = buildInformationMessage({
        username: settings.username,
        post,
        information: event.information,
      });
      await sendDiscordMessage({
        token: settings.botToken,
        channelId: channelFor(settings, event.category),
        payload,
        files,
      });
      console.log(`已發布${event.information.title}：${files.length} 張圖片 (${post.url})`);
    }

    state = rememberPublication(state, post.id, event.category);
  }

  return state;
}

async function runBackfill(settings) {
  if (!settings.backfillPostId) throw new Error("backfill 模式需要 BACKFILL_POST_ID。");
  if (
    !["resource", "recipe", "meteor", "pink-bubble", "redemption-code"].includes(
      settings.backfillCategory,
    )
  ) {
    throw new Error(
      "backfill 模式需要 resource、recipe、meteor、pink-bubble 或 redemption-code 分類。",
    );
  }

  const post = await fetchThreadsPost(settings.username, settings.backfillPostId);
  let state = await loadState(settings.statePath);
  state = await processPost(settings, post, state, {
    onlyCategory: settings.backfillCategory,
    force: settings.forceBackfill,
  });
  state = rememberPost(state, post.id);
  state.lastSuccessfulCheck = new Date().toISOString();
  await saveState(settings.statePath, state);
  console.log(`指定貼文補發完成：${post.url} (${settings.backfillCategory})`);
}

async function runMonitor(settings) {
  const posts = await fetchThreadsPosts(settings.username);
  let state = await loadState(settings.statePath);

  if (!state.initialized) {
    const latestResource = posts.find((post) => extractHeartopiaResources(post.text));
    if (latestResource) {
      state = await processPost(settings, latestResource, state, { onlyCategory: "resource" });
    } else {
      console.log("第一次執行未找到符合條件的資源貼文，先建立追蹤基準。");
    }

    for (const post of posts) state = rememberPost(state, post.id);
    state.initialized = true;
    state.lastSuccessfulCheck = new Date().toISOString();
    await saveState(settings.statePath, state);
    return;
  }

  const unseenCount = posts.filter((post) => !state.seenPostIds.includes(post.id)).length;
  // Profile order is newest first. A missing ID alone is not proof of a new
  // post because Threads can expose older cards on a later scan.
  const unseenPosts = selectFreshUnseenPosts(posts, state);
  for (const post of unseenPosts) {
    state = await processPost(settings, post, state);
    state = rememberPost(state, post.id);
  }

  // Every card visible in this successful scan becomes part of the baseline,
  // including stale cards that were intentionally not published.
  for (const post of [...posts].reverse()) state = rememberPost(state, post.id);
  state.lastSuccessfulCheck = new Date().toISOString();
  await saveState(settings.statePath, state);
  const ignoredStaleCount = unseenCount - unseenPosts.length;
  if (ignoredStaleCount > 0) {
    console.log(`已忽略 ${ignoredStaleCount} 篇較早才載入的歷史貼文。`);
  }
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
  if (settings.mode === "backfill") return runBackfill(settings);
  return runMonitor(settings);
}

main().catch((error) => {
  console.error(`執行失敗：${error?.message || error}`);
  process.exitCode = 1;
});
