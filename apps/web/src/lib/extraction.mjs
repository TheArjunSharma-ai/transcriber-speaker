import { extension, MAX_TEXT_LENGTH } from "./content.mjs";
import { extractHtml } from "./website.mjs";

export function validateSignature(buffer, name) {
  const type = extension(name);
  const start = buffer.subarray(0, 16);
  const ascii = start.toString("latin1");
  const valid = {
    pdf: ascii.startsWith("%PDF-"), docx: ascii.startsWith("PK\x03\x04"),
    wav: ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE",
    mp3: ascii.startsWith("ID3") || (start[0] === 255 && (start[1] & 224) === 224),
    mp4: ascii.slice(4, 8) === "ftyp", m4a: ascii.slice(4, 8) === "ftyp",
    webm: start.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    ogg: ascii.startsWith("OggS"), flac: ascii.startsWith("fLaC"),
    mpeg: start[0] === 0 && start[1] === 0 && start[2] === 1,
  };
  if (type in valid && !valid[type]) throw new Error("File contents do not match the file extension.");
  if (["txt", "md", "csv", "html"].includes(type) && buffer.includes(0)) throw new Error("The document is not a supported UTF-8 text file.");
}

export async function extractDocument(buffer, name) {
  const type = extension(name);
  validateSignature(buffer, name);
  let text = "";
  if (type === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (info.total > 200) throw new Error("PDFs are limited to 200 pages.");
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (type === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (type === "html") {
    text = extractHtml(buffer.toString("utf8")).text;
  } else if (["txt", "md", "csv"].includes(type)) {
    text = buffer.toString("utf8");
  } else {
    throw new Error("This document format is not supported.");
  }
  text = text.trim();
  if (!text) throw new Error("No readable text found. Scanned documents need OCR, which is not enabled yet.");
  if (text.length > MAX_TEXT_LENGTH) throw new Error("Extracted text exceeds the 100,000 character limit.");
  return text;
}