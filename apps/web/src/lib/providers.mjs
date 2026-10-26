import { splitSpeech, SPEECH_VOICES } from "./content.mjs";

async function providerRequest(path, body, multipart = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY in apps/web/.env.local and restart the worker.");
  const response = await fetch(`https://api.openai.com/v1/audio/${path}`, {
    method: "POST", signal: AbortSignal.timeout(600000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(multipart ? {} : { "Content-Type": "application/json" }) },
    body: multipart ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const messages = { 401: "Speech provider rejected the API key.", 429: "Speech provider quota or rate limit reached. Check your account and retry later.", 413: "The speech provider rejected the file size.", 400: "The speech provider could not process this input. Check the media format and language." };
    throw new Error(messages[response.status] || `Speech provider failed (HTTP ${response.status}). Retry manually.`);
  }
  return response;
}

export async function transcribe(buffer, name, language) {
  const form = new FormData();
  form.set("file", new Blob([buffer]), name);
  form.set("model", "whisper-1");
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (language && language !== "auto") form.set("language", language);
  const result = await (await providerRequest("transcriptions", form, true)).json();
  if (!result.text?.trim()) throw new Error("No speech detected in this recording.");
  return {
    text: result.text.trim(), language: result.language,
    duration: result.duration,
    segments: (result.segments || []).map((segment) => ({ start: segment.start, end: segment.end, text: segment.text.trim() })),
  };
}

export function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function generateSpeech(text, voice, speed, onProgress) {
  if (!SPEECH_VOICES.includes(voice)) throw new Error("Unsupported voice.");
  const chunks = splitSpeech(text);
  const audio = [];
  for (const [index, input] of chunks.entries()) {
    onProgress(`Generating audio ${index + 1} of ${chunks.length}`);
    const response = await providerRequest("speech", { model: "gpt-4o-mini-tts", voice, input, speed, response_format: "pcm" });
    audio.push(Buffer.from(await response.arrayBuffer()));
  }
  return pcmToWav(Buffer.concat(audio));
}