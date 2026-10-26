import test from "node:test";
import assert from "node:assert/strict";
import { exportSubtitles, splitSpeech, timestamp, wordCount } from "../apps/web/src/lib/content.mjs";

test("timestamps round correctly across minute boundaries", () => {
    assert.equal(timestamp(59.9999), "00:01:00,000");
    assert.equal(timestamp(3661.125, "."), "01:01:01.125");
});

test("subtitle exports preserve real timing and reject untimed documents", () => {
    const segments = [{ start: 1.5, end: 3.75, text: "Hello world" }];
    assert.equal(exportSubtitles(segments, "srt"), "1\n00:00:01,500 --> 00:00:03,750\nHello world\n");
    assert.match(exportSubtitles(segments, "vtt"), /^WEBVTT\n\n1\n00:00:01\.500/);
    assert.throws(() => exportSubtitles([], "srt"), /timestamped/);
    assert.throws(() => exportSubtitles([{ start: 4, end: 2, text: "bad" }], "srt"), /Invalid/);
});

test("speech chunks stay within provider limits without dropping words", () => {
    const text = "A sentence to speak. ".repeat(800).trim();
    const chunks = splitSpeech(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 3500));
    assert.equal(wordCount(chunks.join(" ")), wordCount(text));
    assert.deepEqual(splitSpeech("   "), []);
});