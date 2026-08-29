import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadState, rememberPost, saveState } from "../src/state.js";

test("狀態檔能保存並防止重複 ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "heartopia-state-"));
  const path = join(directory, "state.json");

  try {
    let state = await loadState(path);
    state = rememberPost(state, "post-a");
    state = rememberPost(state, "post-a");
    state.initialized = true;
    await saveState(path, state);

    const reloaded = await loadState(path);
    assert.equal(reloaded.initialized, true);
    assert.deepEqual(reloaded.seenPostIds, ["post-a"]);
    const persisted = await readFile(path, "utf8");
    assert.doesNotThrow(() => JSON.parse(persisted));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
