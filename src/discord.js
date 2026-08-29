import { formatTaipeiDate } from "./extract.js";

const DISCORD_API_ORIGIN = "https://discord.com/api/v10";

function assertSnowflake(value, name) {
  if (!/^\d{17,20}$/u.test(String(value ?? ""))) {
    throw new Error(`${name} 格式不正確。`);
  }
}

function titleFor(post, resource) {
  const label = resource.newsDate?.label || formatTaipeiDate(post.publishedAt) || "今日";
  return `${label}｜心動小鎮資源`;
}

export function buildResourceMessage({ username, post, resource }) {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: titleFor(post, resource),
        url: post.url,
        description: resource.resourceLine,
        color: 0xe8a5b8,
        footer: { text: `來源：@${username}` },
        ...(post.publishedAt ? { timestamp: post.publishedAt } : {}),
      },
    ],
  };
}

export function buildTestMessage() {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "✅ 心動小鎮小助手已連線",
        description: "Discord 頻道與機器人權限設定正確。之後偵測到新的小鎮資源情報，就會自動發布在這裡。",
        color: 0x65c18c,
      },
    ],
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendDiscordMessage({ token, channelId, payload, maxAttempts = 3 }) {
  if (!token || token.length < 20) throw new Error("尚未設定 DISCORD_BOT_TOKEN GitHub Secret。");
  assertSnowflake(channelId, "DISCORD_CHANNEL_ID");

  const url = `${DISCORD_API_ORIGIN}/channels/${channelId}/messages`;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "HeartopiaThreadsDiscordBot/1.0",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) return await response.json();

      const body = await response.text();
      if (response.status === 429 && attempt < maxAttempts) {
        let retryAfter = 1_000;
        try {
          retryAfter = Math.ceil(Number(JSON.parse(body).retry_after || 1) * 1_000);
        } catch {
          // Keep the safe default delay.
        }
        await wait(Math.min(retryAfter, 15_000));
        continue;
      }

      if (response.status >= 500 && attempt < maxAttempts) {
        await wait(attempt * 1_000);
        continue;
      }

      throw new Error(`Discord API 回傳 ${response.status}：${body.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await wait(attempt * 1_000);
        continue;
      }
    }
  }

  throw lastError || new Error("Discord 訊息發送失敗。");
}

