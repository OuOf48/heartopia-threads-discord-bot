import assert from "node:assert/strict";
import test from "node:test";
import { uniqueImageUrls } from "../src/threads.js";

test("同一張 Threads 圖片優先保留最後的高解析版本", () => {
  const thumbnail =
    "https://scontent-a.cdninstagram.com/v/t51.82787-15/photo_n.jpg?stp=p240x240";
  const fullSize =
    "https://scontent-b.cdninstagram.com/v/t51.82787-15/photo_n.jpg?stp=full";

  assert.deepEqual(uniqueImageUrls([thumbnail, fullSize]), [fullSize]);
});

test("不同 Threads 圖片不會因 CDN 網域不同而混在一起", () => {
  const first = "https://scontent-a.cdninstagram.com/v/t51.82787-15/first.jpg";
  const second = "https://scontent-b.cdninstagram.com/v/t51.82787-15/second.jpg";

  assert.deepEqual(uniqueImageUrls([first, second]), [first, second]);
});
