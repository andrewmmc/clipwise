/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { AppLanguage } from "../types/config";

type Values = Record<string, string | number>;
type Translate = (message: string, values?: Values) => string;

const zhTW: Record<string, string> = {
  "Failed to load config": "無法載入設定",
  "Failed to refresh config": "無法重新載入設定",
  Retry: "重試",
  "Loading…": "載入中…",
  "Getting Started": "開始使用",
  Actions: "操作",
  Providers: "供應商",
  History: "記錄",
  Settings: "設定",
  "Settings sections": "設定分頁",
  About: "關於",
  Delete: "刪除",
  Cancel: "取消",
  Reset: "重設",
  Save: "儲存",
  "Saving…": "儲存中…",
  Edit: "編輯",
  Back: "返回",
  "Remove header": "移除標頭",
  "Remove argument": "移除參數",
  "Move up": "上移",
  "Move down": "下移",
  "Show notification on complete": "完成時顯示通知",
  "Display a macOS notification after text is replaced.":
    "文字替換後顯示 macOS 通知。",
  "Start at login": "登入時啟動",
  "Open Clipwise automatically when you log in to your Mac.":
    "登入 Mac 時自動開啟 Clipwise。",
  "Enable history": "啟用記錄",
  "Store up to 100 transformations in plaintext on this Mac, including failures (first 500 input and 2,000 output characters).":
    "在此 Mac 上以純文字儲存最多 100 筆轉換記錄，包括失敗項目（輸入前 500 字及輸出前 2,000 字）。",
  "Confirm disabling history": "確認停用記錄",
  "Deletes all saved history.": "這將刪除所有已儲存的記錄。",
  Disable: "停用",
  "Max tokens": "最大 token 數",
  "Maximum tokens in LLM responses (default: 4096).":
    "LLM 回應的最大 token 數（預設：4096）。",
  Language: "語言",
  English: "English",
  "Traditional Chinese": "繁體中文",
  "Apple Intelligence (On-Device)": "Apple Intelligence（裝置端）",
  "OpenAI-compatible": "OpenAI 相容",
  "CLI (claude/codex/copilot)": "CLI（claude/codex/copilot）",
  "Getting started guide": "開始使用指南",
  "Review how to configure and use Clipwise.":
    "重新查看 Clipwise 的設定及使用方式。",
  "Show Guide": "顯示指南",
  "Edit Action": "編輯操作",
  "New Action": "新增操作",
  "Action Name": "操作名稱",
  "e.g. Refine wording": "例如：潤飾文字",
  "Shown in the menu bar popup.": "顯示於選單列選單中。",
  Provider: "供應商",
  "Select a provider…": "選擇供應商…",
  "User Prompt": "使用者提示詞",
  "e.g. Refine this text, improve clarity and grammar":
    "例如：潤飾這段文字，改善清晰度及文法",
  "Selected text appended to this prompt.": "所選文字會附加至此提示詞。",
  "Model Override": "指定模型",
  "(optional)": "（選填）",
  "Leave blank for provider default": "留空以使用供應商預設值",
  "Test Action": "測試操作",
  "Test input text…": "測試輸入文字…",
  Test: "測試",
  "Testing…": "測試中…",
  "(empty result)": "（空白結果）",
  "Error: {{message}}": "錯誤：{{message}}",
  "Transform clipboard text via menu bar.": "透過選單列轉換剪貼簿文字。",
  "Add Action": "新增操作",
  "Action saved successfully.": "操作已成功儲存。",
  "Please add a provider first before creating an action.":
    "建立操作前，請先新增供應商。",
  "No actions yet": "尚未有操作",
  "Add an action to get started.": "新增操作以開始使用。",
  "Unknown provider": "未知供應商",
  "Edit Provider": "編輯供應商",
  "New Provider": "新增供應商",
  Name: "名稱",
  Type: "類型",
  "e.g. Anthropic Claude": "例如：Anthropic Claude",
  "Checking Apple Intelligence availability…":
    "正在檢查 Apple Intelligence 可用性…",
  "Only one Apple Intelligence provider can be configured.":
    "只能設定一個 Apple Intelligence 供應商。",
  "Apple Intelligence is currently unavailable on this Mac.":
    "此 Mac 目前無法使用 Apple Intelligence。",
  "Apple Intelligence is available on this Mac but not enabled in system settings.":
    "此 Mac 支援 Apple Intelligence，但尚未在系統設定中啟用。",
  "Apple Intelligence is still preparing its on-device model on this Mac.":
    "Apple Intelligence 仍在此 Mac 上準備裝置端模型。",
  "Apple Intelligence is not supported on this Mac.":
    "此 Mac 不支援 Apple Intelligence。",
  "CLI providers are not available in this build.": "此版本不支援 CLI 供應商。",
  "Enter a command before testing.": "測試前請輸入指令。",
  "Uses Apple's on-device Foundation Model. No API key or configuration needed. Runs privately on your Mac.":
    "使用 Apple 的裝置端 Foundation Model，無需 API 金鑰或其他設定，並在您的 Mac 上私密執行。",
  "Text from your clipboard will be sent to this provider's API for processing. Your API key and custom header values are stored in macOS Keychain.":
    "剪貼簿文字會傳送至此供應商的 API 處理。API 金鑰及自訂標頭值會儲存於 macOS 鑰匙圈。",
  "Testing sends a small request to the provider and may incur API usage.":
    "測試會向供應商傳送小型請求，可能產生 API 用量。",
  "Test connection": "測試連線",
  "API Endpoint": "API 端點",
  "Custom endpoints must use a valid https:// URL.":
    "自訂端點必須使用有效的 https:// URL。",
  "API Key": "API 金鑰",
  "Leave blank to keep saved key": "留空以保留已儲存的金鑰",
  "Enter a new key only if you want to replace the Keychain value.":
    "只有在要取代鑰匙圈中的值時才輸入新金鑰。",
  "Default Model": "預設模型",
  "Custom Headers": "自訂標頭",
  "Add header": "新增標頭",
  "Header name": "標頭名稱",
  Value: "值",
  "Header name {{name}} is reserved.": "標頭名稱 {{name}} 為保留名稱。",
  "Duplicate header names are not allowed: {{name}}.":
    "不可使用重複的標頭名稱：{{name}}。",
  "Leave blank to keep saved value": "留空以保留已儲存的值",
  "Enter a value for header {{name}}.": "請輸入標頭 {{name}} 的值。",
  Command: "指令",
  "Find the binary path with": "使用以下指令尋找執行檔路徑：",
  "e.g. claude": "例如：claude",
  Arguments: "參數",
  "Add arg": "新增參數",
  "Configure headless mode to capture stdout (e.g. -p).":
    "設定無介面模式以擷取標準輸出（例如 -p）。",
  "e.g. --print": "例如：--print",
  "No arguments. Common: --print -m sonnet":
    "沒有參數。常用：--print -m sonnet",
  "Command preview": "指令預覽",
  "The system prompt and copied text are sent through standard input so they are not exposed in the process argument list.":
    "系統提示詞及複製的文字會透過標準輸入傳送，不會顯示於程序參數列表中。",
  "Provider saved successfully.": "供應商已成功儲存。",
  "Configure LLM API providers.": "設定 LLM API 供應商。",
  "Configure LLM API or CLI providers.": "設定 LLM API 或 CLI 供應商。",
  "Add Provider": "新增供應商",
  "Cannot delete: {{count}} action(s) use this provider. Remove them first.":
    "無法刪除：有 {{count}} 個操作使用此供應商。請先移除這些操作。",
  "When you use an API provider (OpenAI, Anthropic), your clipboard text is sent to that provider's servers for processing. Apple Intelligence runs entirely on-device and does not send data externally.":
    "使用 API 供應商（OpenAI、Anthropic）時，剪貼簿文字會傳送至該供應商的伺服器處理。Apple Intelligence 完全在裝置端執行，不會將資料傳送到外部。",
  "API keys are stored locally and never shared with Clipwise or any third party.":
    "API 金鑰儲存在本機，絕不會與 Clipwise 或任何第三方分享。",
  "Privacy Policy": "隱私權政策",
  "No providers configured": "尚未設定供應商",
  "Add an API key to start.": "新增 API 金鑰以開始使用。",
  "Getting started": "開始使用",
  "Welcome to Clipwise": "歡迎使用 Clipwise",
  "Transform copied text with AI, directly from your Mac's menu bar. Set up two things, then Clipwise is ready anywhere you write.":
    "直接從 Mac 選單列使用 AI 轉換複製的文字。只需完成兩項設定，即可在任何輸入文字的地方使用 Clipwise。",
  "How Clipwise works": "Clipwise 的運作方式",
  Copy: "複製",
  "text in any app": "任何 App 中的文字",
  Choose: "選擇",
  "a menu bar action": "選單列操作",
  Paste: "貼上",
  "the transformed text": "轉換後的文字",
  "Choose an AI provider": "選擇 AI 供應商",
  "{{name}} is ready to use.": "{{name}} 已可使用。",
  "Checking Apple Intelligence on this Mac…":
    "正在檢查此 Mac 上的 Apple Intelligence…",
  "Connect Apple Intelligence, an API, or a local CLI.":
    "連接 Apple Intelligence、API 或本機 CLI。",
  "Set Up Provider": "設定供應商",
  "Create your first action": "建立第一個操作",
  "“{{name}}” is available in the menu bar.": "「{{name}}」已顯示於選單列。",
  "Start from a useful template, then adjust it before saving.":
    "先選擇實用範本，再於儲存前調整內容。",
  "Choose a provider first, then select an action template.":
    "請先選擇供應商，再選擇操作範本。",
  "Use Clipwise anywhere": "隨處使用 Clipwise",
  "Copy some text, click the Clipwise icon in the menu bar, choose your action, then paste the transformed result.":
    "複製一些文字，按一下選單列中的 Clipwise 圖示並選擇操作，然後貼上轉換結果。",
  "Everything is ready.": "一切準備就緒。",
  "Complete the provider and action steps to finish.":
    "請完成供應商及操作步驟。",
  Done: "完成",
  "Finishing…": "完成設定中…",
  "Finish Setup": "完成設定",
  "Step {{number}} complete": "步驟 {{number}} 已完成",
  "Step {{number}}": "步驟 {{number}}",
  "Improve writing": "改善文筆",
  "Make concise": "精簡內容",
  Summarize: "摘要",
  "Translate to English": "翻譯成英文",
  "Fix grammar": "修正文法",
  "Improve the writing quality, clarity, and flow of the following text.":
    "改善以下文字的寫作品質、清晰度及流暢度。",
  "Make the following text more concise without losing important meaning.":
    "在不失去重要意思的前提下精簡以下文字。",
  "Summarize the following text clearly and briefly.":
    "清晰簡潔地摘要以下文字。",
  "Translate the following text to English.": "將以下文字翻譯成英文。",
  "Fix grammar, spelling, and punctuation in the following text.":
    "修正以下文字的文法、拼寫及標點。",
  "No transformations recorded.": "尚未記錄任何轉換。",
  "{{count}} transformation": "{{count}} 筆轉換",
  "{{count}} transformations": "{{count}} 筆轉換",
  "Show all entries": "顯示所有項目",
  "Show starred only": "只顯示已加星號項目",
  "Clear non-starred entries": "清除未加星號項目",
  "Clearing…": "清除中…",
  Clear: "清除",
  "Delete all history including starred entries":
    "刪除所有記錄，包括已加星號項目",
  "Deleting…": "刪除中…",
  "Delete All": "全部刪除",
  "Search action, provider, input, or output…": "搜尋操作、供應商、輸入或輸出…",
  All: "全部",
  "Show successful entries": "顯示成功項目",
  Success: "成功",
  "Show failed entries": "顯示失敗項目",
  Failed: "失敗",
  "No history yet": "尚未有記錄",
  "No starred entries": "沒有已加星號項目",
  "No matching entries": "找不到相符項目",
  "Transformations will appear here when you run actions.":
    "執行操作後，轉換記錄會顯示於此。",
  "Star entries to keep them safe from clearing.":
    "為項目加上星號，避免在清除時被刪除。",
  "Try adjusting your search or filters.": "請嘗試調整搜尋內容或篩選條件。",
  "Entry starred.": "已為項目加上星號。",
  "Star removed.": "已移除星號。",
  "History cleared.": "記錄已清除。",
  "Cleared non-starred entries. {{count}} starred item preserved.":
    "已清除未加星號項目，保留 {{count}} 個已加星號項目。",
  "Cleared non-starred entries. {{count}} starred items preserved.":
    "已清除未加星號項目，保留 {{count}} 個已加星號項目。",
  "Entry deleted.": "項目已刪除。",
  "All history deleted, including starred entries.":
    "所有記錄（包括已加星號項目）均已刪除。",
  "Copied {{label}} to clipboard.": "已將{{label}}複製到剪貼簿。",
  input: "輸入",
  output: "輸出",
  error: "錯誤",
  "Unstar entry": "移除星號",
  "Star entry": "加上星號",
  "Delete entry": "刪除項目",
  Input: "輸入",
  Output: "輸出",
  Error: "錯誤",
  Website: "網站",
  "Mac App Store version": "Mac App Store 版本",
  "macOS text transformation via LLM APIs.":
    "透過 LLM API 在 macOS 上轉換文字。",
  "macOS text transformation via LLM APIs & CLI tools.":
    "透過 LLM API 及 CLI 工具在 macOS 上轉換文字。",
  "Copy text, open the menu bar icon, choose an action. The result is copied to your clipboard.":
    "複製文字、開啟選單列圖示並選擇操作，結果便會複製到剪貼簿。",
  "Provider name is required.": "必須輸入供應商名稱。",
  "API key is required for API providers.": "API 供應商必須輸入 API 金鑰。",
  "Endpoint URL must be a valid https:// URL.":
    "端點 URL 必須是有效的 https:// URL。",
  "Command is required for CLI providers.": "CLI 供應商必須輸入指令。",
  "Name, provider, and prompt are required.": "必須輸入名稱、供應商及提示詞。",
  "Selected provider does not exist.": "所選供應商不存在。",
  "User prompt must be {{count}} characters or fewer.":
    "使用者提示詞不得超過 {{count}} 個字元。",
};

export function translate(
  locale: AppLanguage,
  message: string,
  values?: Values,
) {
  let result = locale === "zh-TW" ? (zhTW[message] ?? message) : message;
  for (const [key, value] of Object.entries(values ?? {})) {
    result = result.split(`{{${key}}}`).join(String(value));
  }
  return result;
}

const I18nContext = createContext<{ locale: AppLanguage; t: Translate }>({
  locale: "en",
  t: (message, values) => translate("en", message, values),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: AppLanguage;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider
      value={{
        locale,
        t: (message, values) => translate(locale, message, values),
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
