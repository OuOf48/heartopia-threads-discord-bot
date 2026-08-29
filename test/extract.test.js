import assert from "node:assert/strict";
import test from "node:test";
import { extractHeartopiaResources, formatTaipeiDate } from "../src/extract.js";

test("擷取同一行的家園區域", () => {
  const result = extractHeartopiaResources(`
    8月28日 小鎮新聞～
    今日溜溜橡木：家園04區 螢石：家園11區
    天氣預報：明天流星雨
  `);

  assert.deepEqual(result, {
    kind: "separate",
    oak: "家園04區",
    fluorite: "家園11區",
    resourceLine: "今日溜溜橡木：家園04區　螢石：家園11區",
    newsDate: { month: 8, day: 28, label: "8月28日" },
  });
});

test("擷取分行與非家園地點", () => {
  const result = extractHeartopiaResources(`
    8月28日 小鎮新聞～
    今日溜溜橡木：家園12區
    螢石：溫泉山遺跡
    天氣預報：今晚流星雨
  `);

  assert.equal(result.resourceLine, "今日溜溜橡木：家園12區　螢石：溫泉山遺跡");
  assert.equal(result.fluorite, "溫泉山遺跡");
});

test("擷取橡木與螢石共用區域", () => {
  const result = extractHeartopiaResources("8月27日 小鎮新聞～\n今日溜溜橡木+螢石：家園12區");
  assert.deepEqual(
    { kind: result.kind, oak: result.oak, fluorite: result.fluorite, line: result.resourceLine },
    {
      kind: "shared",
      oak: "家園12區",
      fluorite: "家園12區",
      line: "今日溜溜橡木+螢石：家園12區",
    },
  );
});

test("支援森林等特殊地點", () => {
  const result = extractHeartopiaResources(
    "8月22日 小鎮新聞～\n今日溜溜橡木：靈動松林老家 螢石：家園11區",
  );
  assert.equal(result.oak, "靈動松林老家");
  assert.equal(result.fluorite, "家園11區");
});

test("忽略普通閒聊貼文", () => {
  assert.equal(extractHeartopiaResources("今天去溫泉山挖螢石，真的很好玩。"), null);
});

test("將 ISO 時間轉為台灣日期", () => {
  assert.equal(formatTaipeiDate("2026-08-28T22:14:56.000Z"), "8月29日");
});
