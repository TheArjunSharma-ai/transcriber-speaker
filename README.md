# Sona: Transcriber & Speaker

A JavaScript Next.js application implementing the local-first foundation of [the project plan](Plan.md). The interface uses live persisted data, not demo projects.

## Requirements

- Node.js 24 or newer and npm.
- An OpenAI API key with available billing for media transcription and downloadable speech. Document extraction, editing, exports, and device speech do not require a key.
- A modern browser with SpeechSynthesis support for device playback. Voices depend on the browser and operating system; some browser voices may use remote speech services.

## Run Locally

From the repository root:

```powershell
npm run setup
npm run dev
```

In a second terminal, from the same repository root:

```powershell
npm run worker
```

Open http://127.0.0.1:3000. If Next.js chooses another free port, use the URL printed by the server. Keep both processes running. Run only one worker for this local workspace.

The local environment file is `apps/web/.env.local`; an example is tracked as `apps/web/.env.example`:

```dotenv
OPENAI_API_KEY=
DATA_DIR=../../.data
```

Set the key privately in your editor, never in chat or client-side code. Restart **both** the web server and worker after changing environment variables. `DATA_DIR` is relative to `apps/web`, since npm runs both services there. Both processes must use the same directory. Keep it outside `apps/web` to prevent runtime database writes from triggering development rebuilds.

## Implemented Workflows

| Workflow | Support |
| --- | --- |
| Audio/video transcription | MP3, WAV, MP4, M4A, WebM, OGG, FLAC, MPEG; up to 25 MB; language selection; real provider timestamps |
| Document extraction | Text-based PDF (up to 200 pages), DOCX, UTF-8 TXT, Markdown, CSV, HTML |
| Website import | Public HTML articles; DNS/IP validation, pinned connections, redirect validation, response size/time limits |
| Text/chat | Paste and edit text or conversations; chat remains plain text in this version |
| Editing | Project rename, text search, segment editing, seek-to-timestamp, revision conflicts, unsaved-change warnings |
| Device speech | Browser voices, speed, play, pause, resume, stop |
| Studio speech | OpenAI voice selection, background generation, WAV playback/download, stale-audio marking |
| Exports | TXT; SRT and VTT for actual timestamped transcripts |
| Library | Search, source filters, sorting, grid/list, deletion |
| Processing | Separate worker, persistent SQLite queue, status/stage updates, manual retry, interrupted-job detection |

Extracted and pasted text is limited to 100,000 characters. Studio speech is limited to 20,000 characters per generation and chunked before provider requests. WAV output uses a single 24 kHz, 16-bit mono PCM container. Media is sent directly to the provider's supported ingestion endpoint; FFmpeg is not needed for these limited formats. Larger files, transcoding, and incompatible codecs are not supported yet.

Transcription uses `whisper-1`; generated speech uses `gpt-4o-mini-tts`. API availability and charges depend on the provider account. UI consent is required before sending content. Requests are not automatically retried, because that can duplicate charges; a manual retry may still incur additional charges. Keep permissions for source recordings and documents in mind.

## Architecture

```text
Browser -> Next.js route handlers -> SQLite projects and job queue
                               -> local source assets
Node.js worker -> queue claim -> extraction / website / speech provider
                            -> project status + generated assets
```

```text
apps/web/
  src/app/                 Pages, styles, and API routes
  src/components/          Dashboard, import dialog, editor, settings
  src/lib/                 Storage, parsing, network guards, providers
  scripts/worker.mjs       Separate processing process
tests/                     Unit tests and opt-in live API tests
.data/                     Runtime SQLite database and assets (ignored)
Plan.md                    Full product roadmap
```

SQLite runs in WAL mode with transactional job claiming and edit revision checks. Queued jobs survive restarts. Jobs interrupted while running become failed on worker restart rather than silently issuing another paid request. Progress is stage-based, not an estimated percentage. Project files are deleted with their project; in-progress projects cannot be deleted until their job finishes.

## Verification

```powershell
npm test
npm run lint
npm run build
```

With the web server running:

```powershell
npm run test:integration
```

Unit tests use isolated temporary storage and mocked provider responses; they make no paid calls. The integration test creates and deletes its own project. Live provider calls require your key and are not part of automated tests.

For a production-mode **local** run, stop the development server first, then run `npm run build` followed by `npm start`, while the worker remains running. Do not run a build and dev server against the same `.next` directory simultaneously. Turbopack may report tracing warnings for configurable runtime filesystem paths; this local application is not a serverless deployment bundle.

## GitHub Actions Build Artifact

The workflow [.github/workflows/sona-deploy.yml](.github/workflows/sona-deploy.yml) runs on pushes and pull requests to `main` or `master`, version tags starting with `v`, and manual runs. Despite the filename, this is **build-and-package only**: it does not publish a website, deploy to a server, or enable GitHub Pages.

It installs locked dependencies using Node.js 24, runs lint and unit tests, builds Next.js, and packages the application with its worker. CI then extracts that archive, installs production dependencies, starts the packaged server and worker on loopback, and runs the API integration test. No provider secrets or paid API calls are needed. Runtime data uses the runner's temporary directory.

To run it on GitHub:

1. Commit and push the workflow, application files, and `apps/web/package-lock.json` to your repository.
2. Open **Actions > Sona Build Artifact** and choose **Run workflow**, or push to `main`.
3. After a successful run, download `sona-build-<commit SHA>` from the run's **Artifacts** section. It is retained for 14 days and contains `sona-build.tar.gz`.

The archive includes the production `.next` build, public assets, runtime library modules, worker, package manifests, and environment template. It excludes dependencies, build caches, local SQLite/assets, and private environment files. GitHub's artifact download is a ZIP containing the tar archive; extract both layers into a new directory, not over a running workspace.

From that extracted directory, with Node.js 24 installed:

```powershell
npm --prefix apps/web ci --omit=dev
npm start
```

In a second terminal in the same directory, run `npm run worker`. Configure `apps/web/.env.local` privately for live speech features, following the setup section, and restart both processes after configuration changes. There is no need to rebuild the downloaded artifact. Use a compatible Node.js 24 host; a container image or server deployment is not supplied by this workflow.

The artifact preserves the existing local-only access restrictions. Public hosting still requires the security and infrastructure work below. Failed runs may include diagnostic log artifacts, retained for seven days.

## Security and Remaining Roadmap

**This is a single-user local edition, not the complete production MVP. Do not expose it publicly or deploy it as a multi-user service.** The server binds to loopback and API handlers reject non-local Host headers and cross-origin requests. There is no account system, encrypted file storage, or tenant authorization. Other applications running as your OS user can access local data.

Before a public release, complete the plan's authentication and ownership checks, PostgreSQL/Prisma, Redis/BullMQ, private object storage, quotas, retention policies, rate limits, isolated resource-limited parsing, malware screening, observability, and deployment hardening. The local SQLite queue deliberately avoids requiring those services during initial development; it is not a distributed queue.

Later phases also include OCR/scanned PDFs, legacy DOC conversion, FFmpeg transcoding and larger media, diarization, structured chat import/per-speaker voices, DOCX/PDF exports, translation, summaries, live transcription, collaboration, and billing. Protected websites, paywalls, and client-rendered pages are not bypassed; paste permitted text instead.