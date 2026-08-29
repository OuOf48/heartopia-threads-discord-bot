const LOCATION_PATTERN = "[\\p{Script=Han}A-Za-z0-9]{2,24}";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .replace(/\r\n?/gu, "\n");
}

function normalizeLocation(value) {
  return normalizeText(value).replace(/\s+/gu, "").trim();
}

function findNewsDate(text) {
  const match = normalizeText(text).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*小鎮新聞/iu);
  if (!match) return null;

  return {
    month: Number(match[1]),
    day: Number(match[2]),
    label: `${Number(match[1])}月${Number(match[2])}日`,
  };
}

/**
 * Extract the exact daily resource sentence from a Threads post.
 *
 * Supported examples:
 * - 今日溜溜橡木：家園04區 螢石：家園11區
 * - 今日溜溜橡木：家園12區\n螢石：溫泉山遺跡
 * - 今日溜溜橡木+螢石：家園12區
 * - 今日溜溜橡木：靈動松林老家 螢石：家園11區
 */
export function extractHeartopiaResources(rawText) {
  const text = normalizeText(rawText);

  // Requiring both "今日" and "溜溜橡木" avoids forwarding ordinary posts that
  // merely mention fluorite or an older resource location in conversation.
  if (!/今日\s*溜溜\s*橡木/iu.test(text)) return null;

  const sharedPattern = new RegExp(
    `今日\\s*溜溜\\s*橡木\\s*[+＋&＆、和]\\s*[螢萤]石\\s*[:：]\\s*(${LOCATION_PATTERN})`,
    "iu",
  );
  const sharedMatch = text.match(sharedPattern);
  const newsDate = findNewsDate(text);

  if (sharedMatch) {
    const sharedLocation = normalizeLocation(sharedMatch[1]);
    return {
      kind: "shared",
      oak: sharedLocation,
      fluorite: sharedLocation,
      resourceLine: `今日溜溜橡木+螢石：${sharedLocation}`,
      newsDate,
    };
  }

  const oakPattern = new RegExp(
    `今日\\s*溜溜\\s*橡木\\s*[:：]\\s*(${LOCATION_PATTERN})`,
    "iu",
  );
  const fluoritePattern = new RegExp(
    `[螢萤]石\\s*[:：]\\s*(${LOCATION_PATTERN})`,
    "iu",
  );

  const oakMatch = text.match(oakPattern);
  const fluoriteMatch = text.match(fluoritePattern);
  if (!oakMatch && !fluoriteMatch) return null;

  const oak = oakMatch ? normalizeLocation(oakMatch[1]) : null;
  const fluorite = fluoriteMatch ? normalizeLocation(fluoriteMatch[1]) : null;
  const parts = [];

  if (oak) parts.push(`今日溜溜橡木：${oak}`);
  if (fluorite) parts.push(`螢石：${fluorite}`);

  return {
    kind: "separate",
    oak,
    fluorite,
    resourceLine: parts.join("　"),
    newsDate,
  };
}

export function formatTaipeiDate(isoDate) {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
  }).formatToParts(parsed);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return month && day ? `${month}月${day}日` : null;
}
