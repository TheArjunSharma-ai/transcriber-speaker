"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, AudioLines, Check, ChevronRight, Clock3, FileText, Headphones, LoaderCircle, Pause, Play, RotateCcw, Save, Search, Square, Volume2 } from "lucide-react";
import { api, browserEdition, loadPreferences } from "./api";
import { SPEECH_VOICES, splitSpeech, timestamp, wordCount } from "@/lib/content.mjs";

export default function ProjectEditor({ projectId, status }) {
    const [project, setProject] = useState(null);
    const [draft, setDraft] = useState({ title: "", text: "", segments: [], revision: 1 });
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [saving, setSaving] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [tab, setTab] = useState("text");
    const [search, setSearch] = useState("");
    const [currentTime, setCurrentTime] = useState(0);
    const [engine, setEngine] = useState("device");
    const [voices, setVoices] = useState([]);
    const [deviceVoice, setDeviceVoice] = useState("");
    const [cloudVoice, setCloudVoice] = useState("coral");
    const [speed, setSpeed] = useState(1);
    const [consent, setConsent] = useState(false);
    const [reading, setReading] = useState(false);
    const [paused, setPaused] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const dirtyRef = useRef(false);
    const lastSeen = useRef("");
    const media = useRef(null);
    const textArea = useRef(null);
    const speechRun = useRef(0);
    const currentUtterance = useRef(null);

    useEffect(() => {
        let disposed = false;
        async function refresh() {
            try {
                const data = await api(`/api/projects/${projectId}`);
                if (disposed || data.project.updatedAt < lastSeen.current) return;
                lastSeen.current = data.project.updatedAt;
                setProject(data.project);
                if (!dirtyRef.current) setDraft({ title: data.project.title, text: data.project.text, segments: data.project.segments || [], revision: data.project.revision });
                setLoading(false);
            } catch (failure) { if (!disposed) { setError(failure.message); setLoading(false); } }
        }
        refresh();
        const interval = setInterval(refresh, 2500);
        return () => { disposed = true; clearInterval(interval); };
    }, [projectId]);

    useEffect(() => {
        const synth = window.speechSynthesis;
        const updateVoices = () => setVoices(synth?.getVoices() || []);
        Promise.resolve().then(() => { setSpeechSupported(Boolean(synth)); updateVoices(); setSpeed(Number(loadPreferences().speed) || 1); });
        synth?.addEventListener("voiceschanged", updateVoices);
        function beforeUnload(event) { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } }
        function beforeNavigate(event) {
            const anchor = event.target.closest("a");
            if (dirtyRef.current && anchor && !anchor.href.includes("/api/") && anchor.href !== window.location.href && !window.confirm("Leave without saving your changes?")) { event.preventDefault(); event.stopPropagation(); }
        }
        window.addEventListener("beforeunload", beforeUnload);
        document.addEventListener("click", beforeNavigate, true);
        return () => {
            synth?.removeEventListener("voiceschanged", updateVoices);
            speechRun.current += 1;
            synth?.cancel();
            window.removeEventListener("beforeunload", beforeUnload);
            document.removeEventListener("click", beforeNavigate, true);
        };
    }, []);

    function edit(changes) {
        dirtyRef.current = true;
        setDirty(true);
        setDraft((current) => ({ ...current, ...changes }));
        setMessage("");
    }

    async function save() {
        setSaving(true);
        setError("");
        try {
            const data = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(draft) });
            lastSeen.current = data.project.updatedAt;
            setProject(data.project);
            setDraft({ title: data.project.title, text: data.project.text, segments: data.project.segments, revision: data.project.revision });
            dirtyRef.current = false;
            setDirty(false);
            setMessage("Changes saved.");
        } catch (failure) { setError(failure.message); } finally { setSaving(false); }
    }

    async function queueAction(action, body) {
        setActionBusy(true);
        setError("");
        setMessage("");
        try {
            const data = await api(`/api/projects/${projectId}/${action}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
            setProject(data.project);
            lastSeen.current = data.project.updatedAt;
        } catch (failure) { setError(failure.message); } finally { setActionBusy(false); }
    }

    function stopReading() {
        speechRun.current += 1;
        window.speechSynthesis?.cancel();
        setReading(false);
        setPaused(false);
    }

    function readAloud() {
        const synth = window.speechSynthesis;
        if (!synth) { setError("Text-to-speech is not available in this browser."); return; }
        stopReading();
        setError("");
        const run = speechRun.current;
        const chunks = splitSpeech(draft.text, 220);
        const voice = voices.find((item) => item.voiceURI === deviceVoice);
        let index = 0;
        function speakNext() {
            if (speechRun.current !== run) return;
            if (index >= chunks.length) { setReading(false); setPaused(false); return; }
            const utterance = new SpeechSynthesisUtterance(chunks[index]);
            if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
            utterance.rate = speed;
            utterance.onend = () => { index += 1; speakNext(); };
            utterance.onerror = (event) => { if (speechRun.current === run && !["canceled", "interrupted"].includes(event.error)) { setError(`Browser speech failed: ${event.error}. Try another voice.`); setReading(false); } };
            currentUtterance.current = utterance;
            synth.speak(utterance);
        }
        setReading(true);
        setPaused(false);
        speakNext();
    }

    function togglePause() {
        if (paused) window.speechSynthesis.resume(); else window.speechSynthesis.pause();
        setPaused(!paused);
    }

    function findInText() {
        if (!search || !textArea.current) return;
        const area = textArea.current;
        const index = draft.text.toLowerCase().indexOf(search.toLowerCase(), area.selectionEnd);
        const position = index < 0 ? draft.text.toLowerCase().indexOf(search.toLowerCase()) : index;
        if (position >= 0) { area.focus(); area.setSelectionRange(position, position + search.length); }
    }

    if (loading) return <div className="editor-loading"><LoaderCircle className="spin" size={28} /><span>Opening project...</span></div>;
    if (!project) return <div className="dashboard"><Link href="/library" className="back-link"><ArrowLeft size={16} />All projects</Link><div className="notice error" role="alert">{error || "Project not found."}</div></div>;

    const processing = ["queued", "processing"].includes(project.status);
    const speechCurrent = project.speechAsset && project.speechRevision === project.revision && !dirty;
    const filteredSegments = draft.segments.map((segment, index) => ({ ...segment, index })).filter((segment) => !search || segment.text.toLowerCase().includes(search.toLowerCase()));
    const canRead = Boolean(draft.text.trim()) && !processing;

    return <div className="editor-page page-enter">
        <Link href="/library" className="back-link"><ArrowLeft size={16} />All projects</Link>
        <div className="editor-heading"><div className="editor-name"><span className="eyebrow">{project.type.toUpperCase()} PROJECT</span><input aria-label="Project title" value={draft.title} disabled={processing || saving} maxLength={120} onChange={(event) => edit({ title: event.target.value })} /><div className="editor-metadata"><span><FileText size={13} />{wordCount(draft.text).toLocaleString()} words</span><span><Clock3 size={13} />{Math.max(1, Math.ceil(wordCount(draft.text) / 200))} min read</span><span className={dirty ? "unsaved-label" : "saved-label"}>{dirty ? "Unsaved changes" : <><Check size={12} />Saved</>}</span></div></div><button className="button primary" disabled={!dirty || saving || processing} onClick={save}>{saving ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}{saving ? "Saving..." : "Save changes"}</button></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        {processing && <div className="notice processing" role="status"><LoaderCircle size={18} className="spin" /><div><strong>{project.stage || "Processing"}</strong>{!status.workerOnline && <p>Worker is offline. Start it with npm run worker.</p>}</div></div>}
        {project.status === "failed" && <div className="notice error"><div><strong>Processing needs attention</strong><p>{project.error}</p></div><button className="button secondary" disabled={actionBusy || dirty} onClick={() => queueAction("retry")}><RotateCcw size={16} />Retry job</button></div>}
        <div className="editor-layout"><section className="document-workspace" aria-label="Document editor"><div className="editor-toolbar"><div className="editor-tabs" role="tablist" aria-label="Project view"><button role="tab" aria-selected={tab === "text"} className={tab === "text" ? "active" : ""} onClick={() => setTab("text")}>Text</button><button role="tab" aria-selected={tab === "source"} className={tab === "source" ? "active" : ""} onClick={() => setTab("source")}>Source</button></div><label className="editor-search"><Search size={15} /><input aria-label="Find in text" placeholder="Find in text..." value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") findInText(); }} />{search && !draft.segments.length && <button className="icon-button" title="Next match" aria-label="Next match" onClick={findInText}><ChevronRight size={15} /></button>}</label></div>
            {tab === "text" ? <div className="document-body">{draft.segments.length ? <div className="segments">{filteredSegments.map((segment) => <div key={segment.index} className={`transcript-segment ${currentTime >= segment.start && currentTime < segment.end ? "current" : ""}`}><button className="timestamp" title="Play from this timestamp" aria-label={`Play from ${timestamp(segment.start, ".")}`} onClick={() => { if (media.current) { media.current.currentTime = segment.start; media.current.play().catch(() => setError("The source media could not be played.")); } }}>{timestamp(segment.start, ".").slice(0, 8)}</button><textarea aria-label={`Transcript segment ${segment.index + 1}`} value={segment.text} rows={Math.max(2, Math.ceil(segment.text.length / 70))} disabled={processing || saving} onChange={(event) => { const segments = draft.segments.map((item, index) => index === segment.index ? { ...item, text: event.target.value } : item); edit({ segments, text: segments.map((item) => item.text.trim()).join(" ") }); }} /></div>)}{!filteredSegments.length && <p className="muted">No matching segments.</p>}</div> : <textarea ref={textArea} className="main-text-editor" aria-label="Project text" value={draft.text} placeholder={processing ? "Your text will appear here when processing finishes." : "Your words go here..."} maxLength={100000} disabled={processing || saving} onChange={(event) => edit({ text: event.target.value })} />}</div> : <div className="source-details"><span className="source-icon blue"><FileText size={26} /></span><h2>{project.sourceName || project.title}</h2><dl><div><dt>Source type</dt><dd>{project.type}</dd></div><div><dt>Created</dt><dd>{new Date(project.createdAt).toLocaleString()}</dd></div>{project.sourceSize && <div><dt>File size</dt><dd>{(project.sourceSize / 1024 / 1024).toFixed(2)} MB</dd></div>}{project.language && <div><dt>Language</dt><dd>{project.language}</dd></div>}</dl>{project.sourceAsset && <a className="button secondary" href={`/api/projects/${project.id}/assets/source?download=1`}><ArrowDownToLine size={16} />Download source</a>}{project.sourceUrl && <a className="source-url" href={project.sourceUrl} target="_blank" rel="noreferrer">{project.sourceUrl}</a>}</div>}
            <div className="document-footer"><span>{draft.text.length.toLocaleString()} characters</span><span>{draft.segments.length ? `${draft.segments.length} timed segments` : "Plain text"}</span></div>
            {["audio", "video"].includes(project.type) && project.sourceAsset && <div className="source-player"><span className="eyebrow">ORIGINAL RECORDING</span>{project.type === "video" ? <video ref={media} controls preload="metadata" src={`/api/projects/${project.id}/assets/source`} onTimeUpdate={(event) => setCurrentTime(event.target.currentTime)} /> : <audio ref={media} controls preload="metadata" src={`/api/projects/${project.id}/assets/source`} onTimeUpdate={(event) => setCurrentTime(event.target.currentTime)} />}</div>}
        </section>
            <aside className="voice-panel"><div className="voice-heading"><span className="source-icon green"><Headphones size={21} /></span><div><h2>Give it a voice</h2><span>{browserEdition ? "Device speech" : "Audio studio"}</span></div></div>{!browserEdition && <div className="segmented voice-engine"><button className={engine === "device" ? "selected" : ""} aria-pressed={engine === "device"} onClick={() => { stopReading(); setEngine("device"); }}>Device</button><button className={engine === "studio" ? "selected" : ""} aria-pressed={engine === "studio"} onClick={() => { stopReading(); setEngine("studio"); }}>Studio</button></div>}
                <label className="field-label" htmlFor="voice">Voice</label>{engine === "device" ? <select id="voice" value={deviceVoice} disabled={reading} onChange={(event) => setDeviceVoice(event.target.value)}><option value="">Default device voice</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select> : <select id="voice" value={cloudVoice} onChange={(event) => setCloudVoice(event.target.value)}>{SPEECH_VOICES.map((voice) => <option key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</option>)}</select>}
                <label className="field-label" htmlFor="speech-speed">Speed<span>{speed.toFixed(1)}x</span></label><input id="speech-speed" type="range" min="0.5" max="2" step="0.1" value={speed} disabled={reading} onChange={(event) => setSpeed(Number(event.target.value))} /><div className="range-labels"><span>0.5x</span><span>1x</span><span>2x</span></div>
                {engine === "device" ? <><div className="speech-buttons">{reading ? <><button className="button primary" onClick={togglePause}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? "Resume" : "Pause"}</button><button className="icon-button stop-button" title="Stop reading" aria-label="Stop reading" onClick={stopReading}><Square size={16} /></button></> : <button className="button primary full-width" disabled={!canRead || !speechSupported} onClick={readAloud}><Volume2 size={17} />Read aloud</button>}</div><span className="voice-availability">{!speechSupported ? "Browser speech unavailable" : reading ? paused ? "Playback paused" : "Reading your text" : `${voices.length} device voices available`}</span></> : <><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send this text to OpenAI for AI-generated speech. Provider charges may apply.</span></label><button className="button primary full-width" disabled={!canRead || dirty || !consent || !status.speechConfigured || actionBusy} onClick={() => queueAction("speech", { voice: cloudVoice, speed, consent })}>{actionBusy ? <LoaderCircle className="spin" size={17} /> : <AudioLines size={17} />}Generate audio</button><span className="voice-availability">{!status.speechConfigured ? "Speech provider not configured" : dirty ? "Save your changes first" : "AI-generated voice / WAV audio"}</span></>}
                {project.speechAsset && <div className="generated-audio"><h3>Generated audio<span className={`connection-pill ${speechCurrent ? "connected" : ""}`}>{speechCurrent ? "Current" : "Out of date"}</span></h3><audio controls src={`/api/projects/${project.id}/assets/speech?v=${project.speechAsset}`} /><a className={`button secondary full-width ${!speechCurrent ? "disabled-link" : ""}`} aria-disabled={!speechCurrent} onClick={(event) => { if (!speechCurrent) event.preventDefault(); }} href={`/api/projects/${project.id}/assets/speech?download=1`}><ArrowDownToLine size={16} />Download WAV</a></div>}
                <div className="export-section"><h3>Export project</h3><div className="export-options">{["txt", "srt", "vtt"].map((format) => <a key={format} className={`export-option ${(dirty || (format !== "txt" && !project.segments.length)) ? "disabled-link" : ""}`} aria-disabled={dirty || (format !== "txt" && !project.segments.length)} onClick={(event) => { if (dirty || (format !== "txt" && !project.segments.length)) event.preventDefault(); }} href={`/api/projects/${project.id}/export?format=${format}`}><FileText size={17} /><span>{format.toUpperCase()}</span><ArrowDownToLine size={14} /></a>)}</div></div>
            </aside></div>
    </div>;
}