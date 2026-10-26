import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

export function validateWebUrl(value) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) {
    throw new Error("Use a public HTTP or HTTPS URL on a standard port, without credentials.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || (isIP(hostname) && !isPublicAddress(hostname))) {
    throw new Error("Private and local network URLs are not allowed.");
  }
  return url;
}

export function extractHtml(html, url = "https://document.invalid") {
  const dom = new JSDOM(html, { url });
  try {
    const article = new Readability(dom.window.document).parse();
    return { title: article?.title || dom.window.document.title || "Imported document", text: article?.textContent?.trim() || "" };
  } finally {
    dom.window.close();
  }
}

export async function importWebsite(value) {
  let url = validateWebUrl(value);
  const signal = AbortSignal.timeout(20000);
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
      throw new Error("This URL resolves to a private or reserved network.");
    }
    const chosen = addresses[0];
    const dispatcher = new Agent({ connect: { lookup: (_hostname, options, callback) => {
      if (options.all) callback(null, [chosen]);
      else callback(null, chosen.address, chosen.family);
    } } });
    try {
      const response = await request(url, {
        dispatcher, signal, maxRedirections: 0, headersTimeout: 15000, bodyTimeout: 15000,
        headers: { "user-agent": "TranscriberSpeaker/1.0", accept: "text/html", "accept-encoding": "identity" },
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.body.destroy();
        if (!response.headers.location) throw new Error("The website returned an invalid redirect.");
        url = validateWebUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode !== 200 || !String(response.headers["content-type"]).includes("text/html")) {
        response.body.destroy();
        throw new Error("The URL must return a publicly accessible HTML page.");
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          response.body.destroy();
          throw new Error("Website exceeds the 2 MB import limit.");
        }
        chunks.push(chunk);
      }
      const article = extractHtml(Buffer.concat(chunks).toString("utf8"), url.href);
      if (!article.text) throw new Error("No readable article found. Paste the page text instead.");
      return article;
    } finally {
      await dispatcher.destroy();
    }
  }
  throw new Error("The website redirected too many times.");
}