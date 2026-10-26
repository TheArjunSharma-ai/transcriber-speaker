import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { extractDocument, validateSignature } from "../apps/web/src/lib/extraction.mjs";
import { isPublicAddress, validateWebUrl } from "../apps/web/src/lib/website.mjs";
import { pcmToWav } from "../apps/web/src/lib/providers.mjs";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { zipSync, strToU8 } = require("fflate");

function pdfFixture(text) {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let content = "%PDF-1.4\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(Buffer.byteLength(content));
        content += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(content);
    content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(content);
}

test("website validation blocks local, mapped, reserved and credential URLs", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1", "192.168.1.1", "0.0.0.0", "224.0.0.1"]) {
        assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress("8.8.8.8"), true);
    for (const url of ["http://localhost", "http://127.1", "file:///etc/passwd", "https://user:secret@example.com", "http://example.com:3000"]) {
        assert.throws(() => validateWebUrl(url));
    }
    assert.equal(validateWebUrl("https://example.com/article").hostname, "example.com");
});

test("document extraction handles real text and rejects disguised media", async () => {
    assert.equal(await extractDocument(Buffer.from(" Hello document "), "notes.txt"), "Hello document");
    assert.throws(() => validateSignature(Buffer.from("not a PDF"), "fake.pdf"), /contents/);
    await assert.rejects(extractDocument(Buffer.from([0, 1, 2]), "bad.txt"), /UTF-8/);
    await assert.rejects(extractDocument(Buffer.from("  "), "empty.md"), /No readable/);
});

test("generated audio has a correct PCM WAV container", () => {
    const wav = pcmToWav(Buffer.alloc(48000));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(4), 48036);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(wav.readUInt32LE(40), 48000);
});

test("extracts an actual PDF text stream", async () => {
    const text = await extractDocument(pdfFixture("PDF extraction works"), "fixture.pdf");
    assert.match(text, /PDF extraction works/);
});

test("extracts an actual DOCX archive and excludes HTML scripts", async () => {
    const archive = zipSync({
        "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        "word/document.xml": strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX extraction works</w:t></w:r></w:p></w:body></w:document>'),
    });
    assert.equal(await extractDocument(Buffer.from(archive), "fixture.docx"), "DOCX extraction works");
    const html = await extractDocument(Buffer.from('<html><head><title>Notes</title><script>UNSAFE_SCRIPT</script></head><body><article><p>Readable article content.</p></article></body></html>'), "fixture.html");
    assert.match(html, /Readable article content/);
    assert.doesNotMatch(html, /UNSAFE_SCRIPT/);
});