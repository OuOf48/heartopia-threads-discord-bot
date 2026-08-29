import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VISIBILITY_GRACE_MS,
  selectFreshUnseenPosts,
} from "../src/monitor.js";

test("只處理時間分界後的新貼文，忽略之後才載入的歷史貼文", () => {
  const lastCheck = Date.parse("2026-08-29T12:00:00.000Z");
  const posts = [
    { id: "newest", publishedAt: "2026-08-29T12:30:00.000Z" },
    { id: "seen", publishedAt: "2026-08-29T12:20:00.000Z" },
    {
      id: "grace",
      publishedAt: new Date(lastCheck - DEFAULT_VISIBILITY_GRACE_MS + 1_000).toISOString(),
    },
    { id: "historical", publishedAt: "2026-08-27T06:00:00.000Z" },
  ];
  const state = {
    seenPostIds: ["seen"],
    lastSuccessfulCheck: "2026-08-29T12:00:00.000Z",
  };

  assert.deepEqual(
    selectFreshUnseenPosts(posts, state, { now: Date.parse("2026-08-29T13:00:00.000Z") }).map(
      (post) => post.id,
    ),
    ["grace", "newest"],
  );
});

test("沒有有效檢查時間時不冒險發布歷史貼文", () => {
  assert.deepEqual(
    selectFreshUnseenPosts(
      [{ id: "unknown-age-baseline", publishedAt: "2026-08-29T12:30:00.000Z" }],
      { seenPostIds: [], lastSuccessfulCheck: null },
    ),
    [],
  );
});

test("忽略沒有時間與異常未來時間的貼文", () => {
  const now = Date.parse("2026-08-29T13:00:00.000Z");
  const posts = [
    { id: "future", publishedAt: "2026-08-29T14:00:00.000Z" },
    { id: "missing-time", publishedAt: null },
  ];
  const state = {
    seenPostIds: [],
    lastSuccessfulCheck: "2026-08-29T12:00:00.000Z",
  };

  assert.deepEqual(selectFreshUnseenPosts(posts, state, { now }), []);
});
