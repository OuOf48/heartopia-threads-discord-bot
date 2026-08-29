import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const EMPTY_STATE = Object.freeze({
  version: 1,
  initialized: false,
  seenPostIds: [],
  lastSuccessfulCheck: null,
});

export async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return {
      version: 1,
      initialized: Boolean(parsed.initialized),
      seenPostIds: Array.isArray(parsed.seenPostIds)
        ? parsed.seenPostIds.filter((id) => typeof id === "string").slice(0, 200)
        : [],
      lastSuccessfulCheck:
        typeof parsed.lastSuccessfulCheck === "string" ? parsed.lastSuccessfulCheck : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { ...EMPTY_STATE, seenPostIds: [] };
    throw new Error(`無法讀取狀態檔：${error.message}`);
  }
}

export function rememberPost(state, postId) {
  const seenPostIds = [postId, ...state.seenPostIds.filter((id) => id !== postId)].slice(0, 200);
  return { ...state, seenPostIds };
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

