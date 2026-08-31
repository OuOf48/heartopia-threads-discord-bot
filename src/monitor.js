const DEFAULT_VISIBILITY_GRACE_MS = 10 * 60 * 1_000;
const DEFAULT_STATE_HEARTBEAT_MS = 60 * 60 * 1_000;
const DEFAULT_CATEGORY_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

/**
 * Select only genuinely new profile posts.
 *
 * Threads can reveal older cards after a later page load. An ID that was not
 * in the previous DOM is therefore not enough to prove that a post is new.
 * The last successful scan is the durable time watermark; a short grace
 * period allows for normal Threads visibility delay without replaying history.
 */
export function selectFreshUnseenPosts(posts, state, options = {}) {
  const seen = new Set(state?.seenPostIds || []);
  const lastSuccessfulCheck = Date.parse(state?.lastSuccessfulCheck || "");
  if (!Number.isFinite(lastSuccessfulCheck)) return [];

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const graceMs = Number.isFinite(options.graceMs)
    ? Math.max(0, options.graceMs)
    : DEFAULT_VISIBILITY_GRACE_MS;
  const cutoff = lastSuccessfulCheck - graceMs;

  return posts
    .filter((post) => {
      if (seen.has(post.id)) return false;
      const publishedAt = Date.parse(post.publishedAt || "");
      return (
        Number.isFinite(publishedAt) &&
        publishedAt > cutoff &&
        publishedAt <= now + MAX_FUTURE_SKEW_MS
      );
    })
    .reverse();
}

/**
 * Select recent visible posts that are already known but are missing one or
 * more category publication keys. This lets a newly added classifier backfill
 * its category without replaying categories that were sent before.
 */
export function selectRecentPostsWithMissingPublications(
  posts,
  state,
  categoriesForPost,
  options = {},
) {
  if (typeof categoriesForPost !== "function") return [];

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const windowMs = Number.isFinite(options.windowMs)
    ? Math.max(0, options.windowMs)
    : DEFAULT_CATEGORY_REPLAY_WINDOW_MS;
  const publishedKeys = new Set(state?.publishedKeys || []);

  return posts
    .filter((post) => {
      const publishedAt = Date.parse(post.publishedAt || "");
      if (
        !Number.isFinite(publishedAt) ||
        publishedAt < now - windowMs ||
        publishedAt > now + MAX_FUTURE_SKEW_MS
      ) {
        return false;
      }

      const categories = categoriesForPost(post);
      return categories.some(
        (category) => !publishedKeys.has(`${post.id}:${category}`),
      );
    })
    .reverse();
}

/**
 * Avoid one state commit for every frequent poll while keeping a durable
 * freshness watermark. New posts are persisted immediately by the caller.
 */
export function shouldAdvanceCheckWatermark(state, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const heartbeatMs = Number.isFinite(options.heartbeatMs)
    ? Math.max(0, options.heartbeatMs)
    : DEFAULT_STATE_HEARTBEAT_MS;
  const previous = Date.parse(state?.lastSuccessfulCheck || "");

  return !Number.isFinite(previous) || previous > now || now - previous >= heartbeatMs;
}

export {
  DEFAULT_CATEGORY_REPLAY_WINDOW_MS,
  DEFAULT_STATE_HEARTBEAT_MS,
  DEFAULT_VISIBILITY_GRACE_MS,
};
