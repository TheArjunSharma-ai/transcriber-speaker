"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, FileAudio2, FileText, FolderOpen, Globe2, Grid2X2, HardDrive, LayoutDashboard, List, LoaderCircle, MessageSquareText, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, Type, Video, X } from "lucide-react";
import NewProject from "./new-project";
import ProjectEditor from "./project-editor";
import { api, loadPreferences } from "./api";
import { wordCount } from "@/lib/content.mjs";

const sourceTypes = { audio: { icon: FileAudio2, label: "Audio", color: "green" }, video: { icon: Video, label: "Video", color: "coral" }, document: { icon: FileText, label: "Document", color: "blue" }, website: { icon: Globe2, label: "Website", color: "yellow" }, text: { icon: Type, label: "Text", color: "green" }, chat: { icon: MessageSquareText, label: "Chat", color: "coral" } };
const shortcuts = [{ type: "media", label: "Transcribe media", detail: "Audio & video", icon: AudioLines, color: "green" }, { type: "document", label: "Import a document", detail: "PDF, DOCX & more", icon: FileText, color: "blue" }, { type: "website", label: "Import a website", detail: "A public article", icon: Globe2, color: "yellow" }, { type: "text", label: "Write or paste text", detail: "Text & conversations", icon: Type, color: "coral" }];

export default function Studio({ view, projectId }) {
    const [projects, setProjects] = useState([]);
    const [status, setStatus] = useState({ workerOnline: false, speechConfigured: false });
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");
    const [newMode, setNewMode] = useState(null);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [layout, setLayout] = useState("grid");
    const [sort, setSort] = useState("recent");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let disposed = false;
        async function refresh() {
            try {
                const [data, connection] = await Promise.all([api("/api/projects"), api("/api/status")]);
                if (!disposed) { setProjects(data.projects); setStatus(connection); setError(""); setLoaded(true); }
            } catch (failure) { if (!disposed) { setError(failure.message); setLoaded(true); } }
        }
        refresh();
        const interval = setInterval(refresh, 4000);
        return () => { disposed = true; clearInterval(interval); };
    }, []);

    async function removeProject(project) {
        if (!window.confirm(`Permanently delete "${project.title}" and its files?`)) return;
        try {
            await api(`/api/projects/${project.id}`, { method: "DELETE" });
            setProjects((current) => current.filter((item) => item.id !== project.id));
            setNotice("Project deleted.");
        } catch (failure) { setError(failure.message); }
    }

    const filtered = projects.filter((project) => (filter === "all" || project.type === filter) && project.title.toLowerCase().includes(search.toLowerCase())).sort((first, second) => sort === "name" ? first.title.localeCompare(second.title) : second.updatedAt.localeCompare(first.updatedAt));
    const processing = projects.filter((project) => ["queued", "processing"].includes(project.status));
    const totalWords = projects.reduce((total, project) => total + wordCount(project.text), 0);

    return <div className="app-shell">
        <aside className="sidebar">
            <Link href="/" className="brand" aria-label="Sona home"><span className="brand-icon"><AudioLines size={25} strokeWidth={2.3} /></span><span>sona<span className="brand-period">.</span></span></Link>
            <div className="workspace-switch"><span className="workspace-avatar">P</span><div><strong>Personal workspace</strong><span>Local edition</span></div><ShieldCheck size={16} /></div>
            <span className="nav-caption">WORKSPACE</span>
            <nav aria-label="Main navigation"><Link href="/" className={`nav-item ${view === "dashboard" ? "active" : ""}`}><LayoutDashboard size={19} />Overview</Link><Link href="/library" className={`nav-item ${["library", "project"].includes(view) ? "active" : ""}`}><FolderOpen size={19} />All projects<span className="nav-count">{projects.length}</span></Link><Link href="/settings" className={`nav-item ${view === "settings" ? "active" : ""}`}><Settings2 size={19} />Settings</Link></nav>
            <div className="sidebar-bottom"><div className="connection"><span className={`status-dot ${status.workerOnline ? "online" : ""}`} /><span>Worker {status.workerOnline ? "connected" : "offline"}</span></div><div className="device-note"><HardDrive size={15} /><span>Stored on this device</span></div><div className="profile"><span className="profile-avatar">Y</span><div><strong>Your workspace</strong><span>Private & local</span></div><ShieldCheck size={17} /></div></div>
        </aside>
        <div className="main-column">
            <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{view === "dashboard" ? "Overview" : view === "library" ? "All projects" : view === "settings" ? "Settings" : "Project editor"}</strong></div><div className="topbar-right"><span className="local-badge"><span className="status-dot online" />Local workspace</span><Link className="icon-button" aria-label="Connection settings" title="Connection settings" href="/settings"><CircleHelp size={19} /></Link><span className="small-avatar">Y</span></div></header>
            <main id="main-content">
                {view === "project" ? <ProjectEditor key={projectId} projectId={projectId} status={status} /> : view === "settings" ? <SettingsPanel status={status} /> : <div className="dashboard page-enter">
                    <div className="page-heading"><div><span className="eyebrow">YOUR PERSONAL STUDIO</span><h1>{view === "library" ? "All projects" : "Workspace"}<span className="heading-dot">.</span></h1><p>{view === "library" ? `${projects.length} projects in your library` : "Transcripts, documents & audio"}</p></div><button className="button primary" onClick={() => setNewMode("media")}><Plus size={18} />New project</button></div>
                    {error && <div className="notice error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
                    {notice && <div className="notice success" role="status">{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
                    {view === "dashboard" && <>
                        <div className="stat-band"><div><span className="stat-icon"><FolderOpen size={20} /></span><div><span>Total projects</span><strong>{projects.length.toString().padStart(2, "0")}</strong></div></div><div><span className="stat-icon"><Type size={20} /></span><div><span>Words in your library</span><strong>{totalWords.toLocaleString()}</strong></div></div><div><span className="stat-icon"><AudioLines size={20} /></span><div><span>Processing now</span><strong>{processing.length.toString().padStart(2, "0")}<span className="stat-caption">{processing.length ? "in progress" : "all clear"}</span></strong></div></div></div>
                        <section className="create-section" aria-labelledby="create-heading"><div className="section-label"><h2 id="create-heading">What are we working on?</h2><span>Start something new</span></div><div className="quick-actions">{shortcuts.map(({ type, label, detail, icon: Icon, color }) => <button key={type} onClick={() => setNewMode(type)}><span className={`source-icon ${color}`}><Icon size={23} /></span><strong>{label}</strong><span>{detail}</span><ArrowRight className="quick-arrow" size={17} /></button>)}</div></section>
                    </>}
                    <section className="projects-section" aria-labelledby="projects-heading"><div className="section-label project-section-heading"><h2 id="projects-heading">{view === "library" ? "Your library" : "Recent projects"}<span className="count-pill">{projects.length}</span></h2><div className="project-controls"><label className="search-field"><Search size={16} /><input aria-label="Search projects" placeholder="Search projects..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="segmented icon-segmented" aria-label="Project layout"><button aria-label="Grid view" title="Grid view" aria-pressed={layout === "grid"} className={layout === "grid" ? "selected" : ""} onClick={() => setLayout("grid")}><Grid2X2 size={16} /></button><button aria-label="List view" title="List view" aria-pressed={layout === "list"} className={layout === "list" ? "selected" : ""} onClick={() => setLayout("list")}><List size={18} /></button></div></div></div>
                        <div className="filter-row"><div className="filter-tabs" aria-label="Filter by source type">{["all", "audio", "video", "document", "website", "text", "chat"].map((type) => <button key={type} className={filter === type ? "active" : ""} aria-pressed={filter === type} onClick={() => setFilter(type)}>{type === "all" ? "All files" : sourceTypes[type].label}</button>)}</div><label className="sort-control"><SlidersHorizontal size={14} /><select aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Last updated</option><option value="name">Name A-Z</option></select></label></div>
                        {!loaded ? <div className="empty-state"><LoaderCircle className="spin" size={28} /><h3>Opening your workspace...</h3></div> : !filtered.length ? <div className="empty-state"><div className="empty-illustration" aria-hidden="true"><span className="empty-page back-page" /><span className="empty-page front-page"><AudioLines size={33} /><span /><span /><span /></span><span className="empty-plus"><Plus size={16} /></span></div><h3>{projects.length ? "No matching projects" : "Your next idea starts here"}</h3><p>{projects.length ? "Try another search or source type." : "No projects yet."}</p><button className="button secondary" onClick={() => projects.length ? (setSearch(""), setFilter("all")) : setNewMode("media")}>{projects.length ? "Clear filters" : <><Plus size={17} />Create your first project</>}</button></div> : <div className={`project-grid ${layout === "list" ? "list-layout" : ""}`}>{filtered.map((project) => <ProjectCard key={project.id} project={project} onDelete={() => removeProject(project)} />)}</div>}
                    </section>
                    <footer className="workspace-footer"><span><ShieldCheck size={14} />Your files. Your workspace.</span><span>TRANSCRIBER & SPEAKER <span className="footer-dot">/</span> SONA</span></footer>
                </div>}
            </main>
        </div>
        {newMode && <NewProject initialMode={newMode} onClose={() => setNewMode(null)} />}
    </div>;
}

function ProjectCard({ project, onDelete }) {
    const source = sourceTypes[project.type] || sourceTypes.text;
    const Icon = source.icon;
    const busy = ["queued", "processing"].includes(project.status);
    return <article className="project-card"><Link href={`/projects/${project.id}`} className="project-open"><div className="card-topline"><span className={`source-icon ${source.color}`}><Icon size={23} /></span><span className={`project-status ${project.status}`}>{busy && <LoaderCircle className="spin" size={11} />}{project.status === "ready" ? <><Check size={11} />Ready</> : project.status === "failed" ? "Needs attention" : project.status === "queued" ? "Queued" : "Processing"}</span></div><h3>{project.title}</h3><p className="project-excerpt">{project.text.slice(0, 105) || project.error || project.stage || "Waiting for content"}</p><div className="card-meta"><span>{source.label}</span><span>{wordCount(project.text).toLocaleString()} words</span><span>{new Date(project.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></div></Link><div className="card-actions"><Link href={`/projects/${project.id}`} className="text-action">Open project<ArrowRight size={14} /></Link><div><a href={`/api/projects/${project.id}/export?format=txt`} className="icon-button" aria-label={`Download ${project.title} as text`} title="Download TXT"><ArrowDownToLine size={15} /></a><button className="icon-button danger-hover" aria-label={`Delete ${project.title}`} title="Delete project" disabled={busy} onClick={onDelete}><Trash2 size={15} /></button></div></div></article>;
}

function SettingsPanel({ status }) {
    const [preferences, setPreferences] = useState({ language: "auto", speed: 1 });
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => { Promise.resolve().then(() => setPreferences((current) => ({ ...current, ...loadPreferences() }))); }, []);
    function save(event) {
        event.preventDefault();
        try { localStorage.setItem("sona-preferences", JSON.stringify(preferences)); setSaved(true); setError(""); } catch { setError("Browser preferences could not be saved."); }
    }
    return <div className="dashboard settings-page page-enter"><div className="page-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Settings<span className="heading-dot">.</span></h1><p>Personal workspace preferences</p></div></div><section className="settings-section"><h2>Connections</h2><div className="connection-row"><span><AudioLines size={19} />Background worker</span><span className={`connection-pill ${status.workerOnline ? "connected" : ""}`}>{status.workerOnline ? "Connected" : "Offline"}</span></div><div className="connection-row"><span><Globe2 size={19} />OpenAI speech provider</span><span className={`connection-pill ${status.speechConfigured ? "connected" : ""}`}>{status.speechConfigured ? "Configured" : "Not configured"}</span></div><div className="connection-row"><span><HardDrive size={19} />Project storage</span><span>Local SQLite & files</span></div><div className="connection-row"><span><ShieldCheck size={19} />Access</span><span>This computer only</span></div></section><form className="settings-section" onSubmit={save}><h2>Defaults</h2><label className="field-label" htmlFor="default-language">Recording language</label><select id="default-language" value={preferences.language} onChange={(event) => { setPreferences({ ...preferences, language: event.target.value }); setSaved(false); }}><option value="auto">Detect automatically</option><option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option><option value="ar">Arabic</option></select><label className="field-label" htmlFor="default-speed">Playback speed <span>{preferences.speed}x</span></label><input id="default-speed" type="range" min="0.5" max="2" step="0.1" value={preferences.speed} onChange={(event) => { setPreferences({ ...preferences, speed: Number(event.target.value) }); setSaved(false); }} /><div className="settings-save"><button className="button primary" type="submit"><Check size={17} />{saved ? "Preferences saved" : "Save preferences"}</button></div>{error && <p className="notice error" role="alert">{error}</p>}</form></div>;
}