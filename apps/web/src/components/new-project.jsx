"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileAudio2, FileText, Globe2, LoaderCircle, MessageSquareText, Type, UploadCloud, X } from "lucide-react";
import { api, loadPreferences } from "./api";

const modes = [
    { id: "media", label: "Audio & video", icon: FileAudio2 },
    { id: "document", label: "Document", icon: FileText },
    { id: "website", label: "Website", icon: Globe2 },
    { id: "text", label: "Text", icon: Type },
    { id: "chat", label: "Chat", icon: MessageSquareText },
];

export default function NewProject({ initialMode = "media", onClose }) {
    const router = useRouter();
    const dialog = useRef(null);
    const input = useRef(null);
    const [mode, setMode] = useState(initialMode);
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState("");
    const [text, setText] = useState("");
    const [url, setUrl] = useState("");
    const [language, setLanguage] = useState("auto");
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        dialog.current.showModal();
        Promise.resolve().then(() => setLanguage(loadPreferences().language || "auto"));
    }, []);

    function chooseFile(selected) {
        setError("");
        if (selected?.size > 25 * 1024 * 1024) { setError("Choose a file smaller than 25 MB."); return; }
        setFile(selected || null);
    }

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            let body;
            if (["media", "document"].includes(mode)) {
                if (!file) throw new Error("Choose a file first.");
                body = new FormData();
                body.set("file", file);
                body.set("language", language);
                body.set("consent", String(consent));
            } else {
                body = JSON.stringify({ type: mode, title: title.trim() || (mode === "website" ? "Website import" : mode === "chat" ? "New conversation" : "Untitled text"), ...(mode === "website" ? { url } : { text }) });
            }
            const { project } = await api("/api/projects", { method: "POST", body });
            onClose();
            router.push(`/projects/${project.id}`);
            router.refresh();
        } catch (failure) { setError(failure.message); } finally { setBusy(false); }
    }

    return (
        <dialog ref={dialog} className="new-dialog" aria-labelledby="new-project-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
            <form onSubmit={submit}>
                <div className="dialog-heading"><div><span className="eyebrow">NEW PROJECT</span><h2 id="new-project-title">Create a project</h2></div><button type="button" className="icon-button" title="Close" aria-label="Close" disabled={busy} onClick={onClose}><X size={20} /></button></div>
                <div className="source-tabs" role="tablist" aria-label="Source type">{modes.map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={mode === id} aria-controls="source-panel" type="button" disabled={busy} className={mode === id ? "active" : ""} onClick={() => { setMode(id); setFile(null); setError(""); }}><Icon size={18} /><span>{label}</span></button>)}</div>
                <div className="dialog-content" id="source-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
                    {["media", "document"].includes(mode) ? <>
                        <input ref={input} className="visually-hidden" aria-label="Choose source file" type="file" accept={mode === "media" ? ".mp3,.wav,.mp4,.m4a,.webm,.ogg,.flac,.mpeg" : ".pdf,.docx,.txt,.md,.csv,.html"} onChange={(event) => chooseFile(event.target.files[0])} />
                        <button type="button" className={`file-drop ${dragging ? "dragging" : ""}`} onClick={() => input.current.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}>
                            <span className={`upload-symbol ${file ? "selected" : ""}`}>{file ? <Check size={26} /> : <UploadCloud size={28} />}</span>
                            <strong>{file ? file.name : "Choose a file or drop it here"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : mode === "media" ? "MP3, WAV, MP4, M4A, WebM, OGG, FLAC, MPEG / up to 25 MB" : "PDF, DOCX, TXT, Markdown, CSV, HTML / up to 25 MB"}</span>
                        </button>
                        {mode === "media" && <><label className="field-label" htmlFor="source-language">Recording language</label><select id="source-language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="auto">Detect automatically</option><option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ar">Arabic</option></select><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>I have permission to send this recording to OpenAI for transcription. Provider charges may apply.</span></label></>}
                    </> : <>
                        <label className="field-label" htmlFor="project-title">Project name</label><input id="project-title" placeholder={mode === "chat" ? "A conversation worth keeping" : "Untitled project"} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
                        {mode === "website" ? <><label className="field-label" htmlFor="website-url">Public website URL</label><input id="website-url" type="url" placeholder="https://example.com/article" value={url} required maxLength={2048} onChange={(event) => setUrl(event.target.value)} /></> : <><label className="field-label" htmlFor="source-text">{mode === "chat" ? "Conversation" : "Your text"}</label><textarea id="source-text" rows={8} placeholder={mode === "chat" ? "Alex: Good morning.\nSam: Let's get started." : "Start with a thought..."} value={text} maxLength={100000} required onChange={(event) => setText(event.target.value)} /><span className="field-meta">{text.length.toLocaleString()} / 100,000 characters</span></>}
                    </>}
                    {error && <div className="notice error" role="alert">{error}</div>}
                </div>
                <div className="dialog-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Creating..." : "Create project"}</button></div>
            </form>
        </dialog>
    );
}