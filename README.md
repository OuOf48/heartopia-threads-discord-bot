# 心動小鎮 Threads → Discord 小助手

每 30 分鐘檢查一次 `@oorainielove520oo` 的公開 Threads 貼文，依情報種類分流到 Discord：

```text
今日溜溜橡木：家園04區　螢石：家園11區
```

目前支援五類高信心情報：

- `🪓 溜溜橡木和螢石`：只保留每日橡木與螢石地點
- `📜 更新資料`：辨識「新食譜、食譜有 N 個、食譜總覽」等內容並附上貼文原圖
- `🌠 流星雨`：先發布流星雨時間預報；作者後續發布位置地圖時再附圖發布
- `🫧 粉紅泡泡`：辨識粉紅泡泡位置內容並將貼文原圖發到專屬頻道
- `🎁 兌換碼`：辨識兌換碼、兌換序號或禮包碼，保留序號與期限；圖片型兌換碼最多附前兩張原圖

個人閒聊、普通的「去商店買食譜」敘述與不確定內容不會傳進 Discord。程式也支援：

- 橡木與螢石分開列出的貼文
- `今日溜溜橡木+螢石：家園12區` 的共用區域格式
- `溫泉山遺跡`、`靈動松林老家` 等非家園地點
- 第一次啟動只發送最新一篇符合的貼文
- 中斷後依時間順序補送遺漏的新貼文
- 同一篇貼文可分流到不同頻道，並以「貼文 ID＋情報分類」防止重複
- 只擷取貼文的大圖，排除頭像與介面圖示
- 將 Threads 圖片下載後重新上傳 Discord，避免暫時圖片網址失效
- Discord 限流重試、附件大小防護與安全的 Mention 設定

## 必要設定

前往 `Settings → Secrets and variables → Actions`。

### Secret

| 名稱 | 內容 |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal 產生的真正 Bot Token |

Bot Token 絕對不要放在 Variables、README、程式碼或聊天訊息中。

### Variables

| 名稱 | 內容 |
|---|---|
| `DISCORD_CHANNEL_ID` | `1519592044283170897` |
| `DISCORD_UPDATE_CHANNEL_ID` | `1519591991950839828` |
| `DISCORD_METEOR_CHANNEL_ID` | `1519592074972893195` |
| `DISCORD_PINK_BUBBLE_CHANNEL_ID` | `1525791309871317125` |
| `DISCORD_REDEMPTION_CODE_CHANNEL_ID` | `1519592016005304430` |
| `THREADS_USERNAME` | `oorainielove520oo`（不用加 `@`） |

五個頻道 ID 已有程式預設值；仍建議建立同名 Variables，日後換頻道時不用修改程式。

## GitHub Actions 權限

前往 `Settings → Actions → General → Workflow permissions`：

1. 選擇 **Read and write permissions**。
2. 不用勾選允許建立及核准 Pull Request。
3. 按下 **Save**。

寫入權限只用來更新 `data/state.json`，記錄已處理的貼文 ID。

## Discord 頻道權限

機器人在目標頻道需要：

- 查看頻道
- 傳送訊息
- 嵌入連結
- 附加檔案

不需要開啟 Message Content Intent，也不需要提供 Discord 帳號密碼。

## 第一次測試

1. 打開 GitHub 倉庫的 **Actions**。
2. 選擇 **Threads 心動小鎮監測**。
3. 點擊 **Run workflow**。
4. 先選 `discord-test`，確認頻道出現「小助手已連線」。
5. 再執行一次並選 `dry-run`，它只讀取與解析 Threads，不會發訊息。
6. 最後選 `monitor`；第一次會把目前最新一篇符合條件的資源貼文發進 Discord。

之後排程會在每小時的第 17、47 分自動檢查。

## 執行模式

| 模式 | 用途 | 是否發 Discord | 是否更新狀態 |
|---|---|---:|---:|
| `discord-test` | 測試 Token、頻道 ID 與機器人權限 | 是 | 否 |
| `dry-run` | 測試 Threads 讀取和文字解析 | 否 | 否 |
| `monitor` | 正式監測 | 有新情報時 | 是 |
| `backfill` | 管理者指定單篇貼文與分類補發 | 是 | 是 |

## 本機開發

需要 Node.js 22 以上，以及本機的 Chrome/Chromium：

```bash
npm ci
npm test
CHROME_PATH=/path/to/chrome THREADS_USERNAME=oorainielove520oo npm run check
```

正式發送還需要自行在環境變數中設定 `DISCORD_BOT_TOKEN` 與 `DISCORD_CHANNEL_ID`。

## 注意事項

這個版本只讀取公開 Threads 頁面，不需要 Threads 密碼，也不使用付費 AI API。圖片分類優先依貼文文字中的高信心規則判斷，不會單憑模糊圖片猜測。Threads 若大幅修改網頁結構，Action 會明確失敗並留下錯誤紀錄，不會把整篇不相關內容誤傳到 Discord。
