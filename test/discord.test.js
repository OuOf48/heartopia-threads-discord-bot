import assert from "node:assert/strict";
import test from "node:test";
import { buildResourceMessage } from "../src/discord.js";

test("Discord Embed 只包含整理後的資源資訊", () => {
  const payload = buildResourceMessage({
    username: "oorainielove520oo",
    post: {
      url: "https://www.threads.com/@oorainielove520oo/post/example",
      publishedAt: "2026-08-28T22:14:56.000Z",
    },
    resource: {
      resourceLine: "今日溜溜橡木：家園12區　螢石：溫泉山遺跡",
      newsDate: { label: "8月28日" },
    },
  });

  assert.equal(payload.embeds[0].title, "8月28日｜心動小鎮資源");
  assert.equal(payload.embeds[0].description, "今日溜溜橡木：家園12區　螢石：溫泉山遺跡");
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

