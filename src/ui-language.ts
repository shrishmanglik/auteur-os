export type NoticeRecovery = "model" | "prompts" | "review-upload" | "dismiss";

export interface NoticePresentation {
  kind: "status" | "error";
  message: string;
  actionLabel: string | null;
  recovery: NoticeRecovery | null;
}

const ERROR_PATTERN = /failed|could not|not ready|unavailable|exceeds|limit|unsupported|select at least|attach provider|needs compile|offline|stopped responding|timed out|invalid/i;

export function noticePresentation(message: string): NoticePresentation {
  if (!ERROR_PATTERN.test(message)) return { kind: "status", message, actionLabel: null, recovery: null };

  if (/ollama|local model|local brain|model host/i.test(message)) {
    return { kind: "error", message, actionLabel: "View model status", recovery: "model" };
  }
  if (/provider evidence|review limit|attach provider/i.test(message)) {
    return { kind: "error", message, actionLabel: "Choose smaller file", recovery: "review-upload" };
  }
  if (/prompt|packet|compile|export/i.test(message)) {
    return { kind: "error", message, actionLabel: "Open Prompt Package", recovery: "prompts" };
  }
  return { kind: "error", message, actionLabel: "Keep editing", recovery: "dismiss" };
}
