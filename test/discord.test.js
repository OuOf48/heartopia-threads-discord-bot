import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInformationMessage,
  buildResourceMessage,
  sendDiscordMessage,
} from "../src/discord.js";

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

test("食譜 Embed 使用分類標題與原貼文連結", () => {
  const payload = buildInformationMessage({
    username: "oorainielove520oo",
    post: {
      url: "https://www.threads.com/@oorainielove520oo/post/example",
      publishedAt: "2026-08-25T03:00:00.000Z",
      text: "8月25日 小鎮新聞～\n慶典食譜有21個",
    },
    information: {
      category: "recipe",
      title: "🍳 新食譜情報",
      summary: "慶典食譜有21個",
    },
  });

  assert.equal(payload.embeds[0].title, "🍳 新食譜情報｜8月25日");
  assert.equal(payload.embeds[0].url, "https://www.threads.com/@oorainielove520oo/post/example");
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("有圖片時使用 Discord multipart 附件格式", async () => {
  let request;
  await sendDiscordMessage({
    token: "a-valid-discord-bot-token",
    channelId: "1519591991950839828",
    payload: { content: "圖片測試", allowed_mentions: { parse: [] } },
    files: [
      {
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
        filename: "recipe.png",
        description: "食譜圖片",
      },
    ],
    maxAttempts: 1,
    fetchImpl: async (_url, options) => {
      request = options;
      return new Response(JSON.stringify({ id: "message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.ok(request.body instanceof FormData);
  assert.equal(request.headers["Content-Type"], undefined);
  const payload = JSON.parse(request.body.get("payload_json"));
  assert.deepEqual(payload.attachments, [
    { id: 0, filename: "recipe.png", description: "食譜圖片" },
  ]);
  assert.ok(request.body.get("files[0]") instanceof Blob);
});
