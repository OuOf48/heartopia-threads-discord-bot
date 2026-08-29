import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const EMPTY_STATE = Object.freeze({
  version: 2,
  initialized: false,
  seenPostIds: [],
  publishedKeys: [],
  lastSuccessfulCheck: null,
});

const MAX_SEEN_POSTS = 200;
const MAX_PUBLISHED_KEYS = 800;

function validStrings(value, limit) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.length > 0).slice(0, limit)
    : [];
}

export async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const seenPostIds = validStrings(parsed.seenPostIds, MAX_SEEN_POSTS);
    const storedPublishedKeys = validStrings(parsed.publishedKeys, MAX_PUBLISHED_KEYS);

    // Version 1 only published the resource category. Mark those posts as
    // already published for that category so upgrading cannot duplicate them.
    const publishedKeys =
      storedPublishedKeys.length > 0
        ? storedPublishedKeys
        : seenPostIds.map((id) => `${id}:resource`).slice(0, MAX_PUBLISHED_KEYS);

    return {
      version: 2,
      initialized: Boolean(parsed.initialized),
      seenPostIds,
      publishedKeys,
      lastSuccessfulCheck:
        typeof parsed.lastSuccessfulCheck === "string" ? parsed.lastSuccessfulCheck : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ...EMPTY_STATE, seenPostIds: [], publishedKeys: [] };
    }
    throw new Error(`無法讀取狀態檔：${error.message}`);
  }
}

export function rememberPost(state, postId) {
  const seenPostIds = [postId, ...state.seenPostIds.filter((id) => id !== postId)].slice(
    0,
    MAX_SEEN_POSTS,
  );
  return { ...state, seenPostIds };
}

export function publicationKey(postId, category) {
  return `${postId}:${category}`;
}

export function hasPublication(state, postId, category) {
  return state.publishedKeys.includes(publicationKey(postId, category));
}

export function rememberPublication(state, postId, category) {
  const key = publicationKey(postId, category);
  const publishedKeys = [key, ...state.publishedKeys.filter((item) => item !== key)].slice(
    0,
    MAX_PUBLISHED_KEYS,
  );
  return { ...state, publishedKeys };
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
