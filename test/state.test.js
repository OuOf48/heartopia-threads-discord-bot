import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  hasPublication,
  loadState,
  rememberPost,
  rememberPublication,
  saveState,
} from "../src/state.js";

test("狀態檔能保存並防止重複 ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "heartopia-state-"));
  const path = join(directory, "state.json");

  try {
    let state = await loadState(path);
    state = rememberPost(state, "post-a");
    state = rememberPost(state, "post-a");
    state = rememberPublication(state, "post-a", "resource");
    state = rememberPublication(state, "post-a", "recipe");
    state = rememberPublication(state, "post-a", "recipe");
    state.initialized = true;
    await saveState(path, state);

    const reloaded = await loadState(path);
    assert.equal(reloaded.initialized, true);
    assert.deepEqual(reloaded.seenPostIds, ["post-a"]);
    assert.equal(hasPublication(reloaded, "post-a", "resource"), true);
    assert.equal(hasPublication(reloaded, "post-a", "recipe"), true);
    assert.equal(hasPublication(reloaded, "post-a", "meteor"), false);
    assert.deepEqual(reloaded.publishedKeys, ["post-a:recipe", "post-a:resource"]);
    const persisted = await readFile(path, "utf8");
    assert.doesNotThrow(() => JSON.parse(persisted));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("舊版狀態會遷移為已發布資源，避免升級後重複", async () => {
  const directory = await mkdtemp(join(tmpdir(), "heartopia-state-v1-"));
  const path = join(directory, "state.json");

  try {
    await saveState(path, {
      version: 1,
      initialized: true,
      seenPostIds: ["old-post"],
      lastSuccessfulCheck: null,
    });
    const migrated = await loadState(path);
    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.publishedKeys, ["old-post:resource"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
