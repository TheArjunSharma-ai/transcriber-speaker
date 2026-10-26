export const browserEdition = process.env.NEXT_PUBLIC_BROWSER_EDITION === "true";
let transport = (...argumentsList) => fetch(...argumentsList);

export function configureApiTransport(handler) {
    transport = handler;
}

export async function api(path, options = {}) {
    const response = await transport(path, {
        ...options,
        headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
}

export function loadPreferences() {
    try { return JSON.parse(localStorage.getItem("sona-preferences") || "{}"); } catch { return {}; }
}