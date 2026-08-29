const DEFAULT_VISIBILITY_GRACE_MS = 10 * 60 * 1_000;
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

export { DEFAULT_VISIBILITY_GRACE_MS };
