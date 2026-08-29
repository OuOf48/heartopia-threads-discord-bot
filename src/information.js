const UI_ONLY_LINE = /^(?:svg|更多|讚|回覆|轉發|分享|載入中……?)$/iu;
const RECIPE_PATTERN =
  /(?:新(?:增)?食譜|食譜\s*(?:共有|共|有)\s*\d+|食譜\s*(?:總覽|一覽|圖鑑|清單|配方|圖片)|(?:完整|全部|所有)\s*.{0,8}食譜|每.{0,16}食譜)/iu;
const METEOR_PATTERN = /流星雨/iu;
const METEOR_LOCATION_PATTERN =
  /(?:流星雨[^\n]{0,20}(?:位置|地圖)|(?:位置|地圖)[^\n]{0,20}流星雨)/iu;
const PINK_BUBBLE_PATTERN = /粉紅(?:色)?泡泡/iu;

function normalizedLines(rawText) {
  return String(rawText ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !UI_ONLY_LINE.test(line));
}

function clip(value, maxLength = 900) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function recipeSummary(lines) {
  const start = lines.findIndex((line) => RECIPE_PATTERN.test(line));
  if (start < 0) return null;

  const selected = [];
  for (const line of lines.slice(start, start + 7)) {
    if (/^(?:今日溜溜橡木|螢石\s*[:：]|天氣預報\s*[:：])/iu.test(line)) break;
    selected.push(line);
  }
  return clip(selected.join("\n"));
}

function meteorSummary(lines, isLocation) {
  const start = lines.findIndex((line) => METEOR_PATTERN.test(line));
  if (start < 0) return null;

  const selected = [lines[start]];
  if (isLocation) {
    const next = lines[start + 1];
    if (
      next &&
      next.length <= 100 &&
      !/^(?:今日溜溜橡木|螢石\s*[:：]|天氣預報\s*[:：]|慶典|溫馨提示)/iu.test(next)
    ) {
      selected.push(next);
    }
  }
  return clip(selected.join("\n"), 500);
}

function pinkBubbleSummary(lines) {
  const start = lines.findIndex((line) => PINK_BUBBLE_PATTERN.test(line));
  if (start < 0) return null;
  return clip(lines.slice(start, start + 2).join("\n"), 500);
}

/**
 * Classify only high-confidence, actionable information.
 *
 * Recipe posts intentionally require a strong phrase such as "食譜有21個"
 * or "新食譜". A passing mention such as "去商店買食譜" is ignored so an
 * unrelated event image is never routed as a recipe image.
 */
export function classifyInformation(rawText) {
  const text = String(rawText ?? "").normalize("NFKC");
  const lines = normalizedLines(text);
  const results = [];

  if (RECIPE_PATTERN.test(text)) {
    results.push({
      category: "recipe",
      title: "🍳 新食譜情報",
      summary: recipeSummary(lines),
      attachImages: true,
      requireImages: true,
    });
  }

  if (METEOR_PATTERN.test(text)) {
    const isLocation = METEOR_LOCATION_PATTERN.test(text);
    results.push({
      category: "meteor",
      title: isLocation ? "🌠 流星雨位置" : "🌠 流星雨預報",
      summary: meteorSummary(lines, isLocation),
      attachImages: isLocation,
      requireImages: isLocation,
    });
  }

  if (PINK_BUBBLE_PATTERN.test(text)) {
    results.push({
      category: "pink-bubble",
      title: "🫧 粉紅泡泡位置",
      summary: pinkBubbleSummary(lines),
      attachImages: true,
      requireImages: true,
      imageSelection: { mode: "head", count: 2 },
    });
  }

  return results.filter((result) => result.summary);
}

export function selectInformationImageUrls(imageUrls, information) {
  const urls = [...imageUrls];
  const selection = information?.imageSelection;
  if (!selection) return urls;
  const count = Math.max(0, Number(selection.count) || 0);
  if (selection.mode === "head") return urls.slice(0, count);
  if (selection.mode === "tail") return urls.slice(-count);
  return urls;
}
