import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInformation,
  selectInformationImageUrls,
} from "../src/information.js";

test("辨識高信心食譜貼文並保留相關段落", () => {
  const results = classifyInformation(`
    8月25日 小鎮新聞～
    今日溜溜橡木：家園11區
    螢石：家園02區
    慶典食譜有21個OMG...而且真的一堆蔬菜
    真的要多種玉米、茄子、胡蘿蔔、蕃茄
    居然每一種雀鱔都有一個食譜
  `);

  assert.equal(results.length, 1);
  assert.equal(results[0].category, "recipe");
  assert.equal(results[0].requireImages, true);
  assert.match(results[0].summary, /^慶典食譜有21個/u);
  assert.doesNotMatch(results[0].summary, /今日溜溜橡木/u);
});

test("不把普通的買食譜活動說明誤判為食譜圖片", () => {
  const results = classifyInformation(`
    慶典開始～ 去馬西莫那裡買食譜+限定材料
    布蘭克那裡買限定農作物+花
  `);
  assert.deepEqual(results, []);
});

test("辨識純文字流星雨預報", () => {
  const [result] = classifyInformation("天氣預報：今晚18-24流星雨🌠");
  assert.equal(result.category, "meteor");
  assert.equal(result.title, "🌠 流星雨預報");
  assert.equal(result.attachImages, false);
  assert.equal(result.summary, "天氣預報:今晚18-24流星雨🌠");
});

test("辨識流星雨位置圖片貼文並包含下一行地點", () => {
  const [result] = classifyInformation(`
    小鎮號外～
    今日流星雨🌠位置～
    朵朵在花田巴士站🚏
    讚
    分享
  `);
  assert.equal(result.title, "🌠 流星雨位置");
  assert.equal(result.requireImages, true);
  assert.equal(result.summary, "今日流星雨🌠位置~\n朵朵在花田巴士站🚏");
});

test("辨識粉紅泡泡位置並要求貼文圖片", () => {
  const results = classifyInformation(`
    Day 1表情泡泡：森林小鹿塔+紫光海灘
    粉紅泡泡🫧看位置圖～
  `);
  const result = results.find((item) => item.category === "pink-bubble");
  assert.equal(result.title, "🫧 粉紅泡泡位置");
  assert.equal(result.requireImages, true);
  assert.equal(result.summary, "粉紅泡泡🫧看位置圖~");
  assert.deepEqual(
    selectInformationImageUrls(
      ["event-guide", "bug-guide", "bubble-map-1", "bubble-map-2"],
      result,
    ),
    ["bubble-map-1", "bubble-map-2"],
  );
});

test("辨識兌換碼並保留序號與期限", () => {
  const results = classifyInformation(`
    小鎮號外～
    新兌換碼來了～
    HEARTOPIA2026
    有效期限：9月5日
  `);
  const result = results.find((item) => item.category === "redemption-code");

  assert.equal(result.title, "🎁 心動小鎮兌換碼");
  assert.equal(result.requireImages, false);
  assert.equal(result.attachImages, true);
  assert.equal(result.summary, "新兌換碼來了~\nHEARTOPIA2026\n有效期限:9月5日");
  assert.deepEqual(
    selectInformationImageUrls(["code-image", "instructions", "unrelated-slide"], result),
    ["code-image", "instructions"],
  );
});

test("辨識藍鑽與風物新獎池並擷取更新段落", () => {
  const results = classifyInformation(`
    9月1日 小鎮新聞～
    今日溜溜橡木：家園01區
    螢石：家園04區
    另外是這次藍鑽跟風物爆料！！
    好消息：今次藍鑽池超可愛😍
    壞消息：保底2620藍鑽🤣
    風物這個風格是展演平替嗎xD
    PS. 慶典商店每星期有藍鑽買
  `);
  const result = results.find((item) => item.category === "lottery-pool");

  assert.equal(result.title, "🎟️ 新抽獎獎池情報");
  assert.equal(result.requireImages, false);
  assert.equal(result.attachImages, true);
  assert.match(result.summary, /^另外是這次藍鑽跟風物爆料!!/u);
  assert.match(result.summary, /保底2620藍鑽/u);
  assert.doesNotMatch(result.summary, /今日溜溜橡木|PS\./u);
  assert.deepEqual(
    selectInformationImageUrls(
      ["pool-1", "pool-2", "pool-3", "pool-4", "unrelated"],
      result,
    ),
    ["pool-1", "pool-2", "pool-3", "pool-4"],
  );
});

test("辨識簡體抽獎獎池", () => {
  const [result] = classifyInformation("最新抽奖奖池更新～");
  assert.equal(result.category, "lottery-pool");
});

test("辨識簡體兌換碼關鍵字", () => {
  const [result] = classifyInformation("最新兑换码：WELCOME2026");
  assert.equal(result.category, "redemption-code");
  assert.equal(result.summary, "最新兑换码:WELCOME2026");
});

test("忽略無關個人動態", () => {
  assert.deepEqual(classifyInformation("最麻煩的完成✅ 總算安心了，可以補眠了。"), []);
});
