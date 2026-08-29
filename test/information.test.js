import assert from "node:assert/strict";
import test from "node:test";
import { classifyInformation } from "../src/information.js";

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

test("忽略無關個人動態", () => {
  assert.deepEqual(classifyInformation("最麻煩的完成✅ 總算安心了，可以補眠了。"), []);
});

