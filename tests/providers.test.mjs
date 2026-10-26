import test from "node:test";
import assert from "node:assert/strict";
import { generateSpeech, transcribe } from "../apps/web/src/lib/providers.mjs";

test("transcription sends multipart media and preserves provider timestamps", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-a-credential";
    try {
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
            assert.equal(options.body.get("model"), "whisper-1");
            assert.equal(options.body.get("language"), "hi");
            assert.equal(options.body.get("file").name, "recording.wav");
            return Response.json({ text: " A real transcript ", language: "hindi", duration: 4, segments: [{ start: 0.25, end: 3.5, text: " A real transcript " }] });
        };
        const result = await transcribe(Buffer.from("media"), "recording.wav", "hi");
        assert.equal(result.text, "A real transcript");
        assert.deepEqual(result.segments, [{ start: 0.25, end: 3.5, text: "A real transcript" }]);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    }
});

test("speech chunks become a single valid WAV without automatic paid retries", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-a-credential";
    try {
        let calls = 0;
        globalThis.fetch = async (_url, options) => {
            calls += 1;
            const input = JSON.parse(options.body);
            assert.ok(input.input.length <= 3500);
            assert.equal(input.response_format, "pcm");
            return new Response(Buffer.alloc(100));
        };
        const audio = await generateSpeech("A sentence. ".repeat(800), "coral", 1, () => { });
        assert.ok(calls > 1);
        assert.equal(audio.readUInt32LE(40), calls * 100);
        calls = 0;
        globalThis.fetch = async () => { calls += 1; return new Response("", { status: 429 }); };
        await assert.rejects(generateSpeech("Hello", "coral", 1, () => { }), /quota or rate limit/);
        assert.equal(calls, 1);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    }
});