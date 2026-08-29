import assert from "node:assert/strict";
import test from "node:test";
import { downloadPostImages, isAllowedThreadsImageUrl } from "../src/media.js";

test("只允許 Threads 與 Instagram/Facebook 圖片 CDN", () => {
  assert.equal(isAllowedThreadsImageUrl("https://scontent-tpe1-1.cdninstagram.com/example.jpg"), true);
  assert.equal(isAllowedThreadsImageUrl("https://instagram.ftpe8-2.fna.fbcdn.net/example.webp"), true);
  assert.equal(isAllowedThreadsImageUrl("http://cdninstagram.com/example.jpg"), false);
  assert.equal(isAllowedThreadsImageUrl("https://example.com/image.jpg"), false);
});

test("下載圖片並產生安全的 Discord 附件名稱", async () => {
  const url = "https://scontent-tpe1-1.cdninstagram.com/recipe.jpg";
  const files = await downloadPostImages([url, url], "post_123", {
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "3" },
      }),
  });

  assert.equal(files.length, 1);
  assert.equal(files[0].filename, "threads-post_123-1.jpg");
  assert.equal(files[0].contentType, "image/jpeg");
  assert.deepEqual([...files[0].data], [1, 2, 3]);
});

test("拒絕非圖片回應", async () => {
  await assert.rejects(
    downloadPostImages(
      ["https://scontent-tpe1-1.cdninstagram.com/not-image"],
      "post_123",
      {
        fetchImpl: async () =>
          new Response("not an image", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
      },
    ),
    /不是支援的圖片格式/u,
  );
});

test("不同網址下載到相同圖片內容時只保留一張", async () => {
  const urls = [
    "https://scontent-a.cdninstagram.com/first.jpg",
    "https://scontent-b.cdninstagram.com/second.jpg",
  ];
  const files = await downloadPostImages(urls, "post_123", {
    fetchImpl: async () =>
      new Response(new Uint8Array([9, 8, 7]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
  });

  assert.equal(files.length, 1);
});
