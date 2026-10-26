export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 100000;
export const DOCUMENT_EXTENSIONS = ["txt", "md", "csv", "html", "pdf", "docx"];
export const MEDIA_EXTENSIONS = ["mp3", "wav", "mp4", "m4a", "webm", "ogg", "flac", "mpeg"];
export const SPEECH_VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

export function extension(name) {
  return name.toLowerCase().split(".").pop();
}

export function wordCount(text = "") {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function timestamp(seconds, separator = ",") {
  const milliseconds = Math.round(Math.max(0, Number(seconds) || 0) * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${separator}${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function exportSubtitles(segments, format) {
  if (!["srt", "vtt"].includes(format)) throw new Error("Unsupported subtitle format.");
  if (!segments?.length) throw new Error("Subtitles require a timestamped transcript.");
  const separator = format === "vtt" ? "." : ",";
  const cues = segments.map((segment, index) => {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start) {
      throw new Error("Invalid transcript timestamps.");
    }
    const text = segment.text.replace(/-->/g, "->").replace(/\r?\n\s*\r?\n/g, "\n").trim();
    return `${index + 1}\n${timestamp(segment.start, separator)} --> ${timestamp(segment.end, separator)}\n${text}`;
  });
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${cues.join("\n\n")}\n`;
}

export function splitSpeech(text, limit = 3500) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid speech chunk size.");
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const section = remaining.slice(0, limit);
    const boundary = Math.max(section.lastIndexOf("\n"), section.lastIndexOf(". "), section.lastIndexOf(" "));
    const end = boundary > limit / 2 ? boundary + 1 : limit;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}