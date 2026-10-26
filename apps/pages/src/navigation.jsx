import { useSyncExternalStore } from "react";

export default function Link({ href, children, ...properties }) {
    const target = href.startsWith("/") ? `${import.meta.env.BASE_URL}#${href}` : href;
    return <a href={target} {...properties}>{children}</a>;
}

export function useRouter() {
    return {
        push(path) { window.location.hash = path; },
        refresh() { window.dispatchEvent(new HashChangeEvent("hashchange")); },
    };
}

function subscribe(listener) {
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
}

export function useRoute() {
    return useSyncExternalStore(subscribe, () => window.location.hash.slice(1) || "/", () => "/");
}