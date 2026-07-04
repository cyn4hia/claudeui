import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || null; // null = whatever your Claude app defaults to

const SYSTEM_PROMPT = [
  "You are Claude, chatting in a cozy custom desktop-style chat client.",
  "Be warm, helpful, and conversational. Use markdown (code blocks, lists, bold) when it improves readability.",
  "Keep answers focused; expand into detail when the user asks for it.",
].join(" ");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleChat(req, res) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      res.writeHead(413).end();
      return;
    }
  }

  let message, sessionId;
  try {
    const body = JSON.parse(raw);
    message = typeof body.message === "string" ? body.message.trim() : "";
    sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  } catch {
    message = "";
  }
  if (!message || message.length > 400_000) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad request" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  let streamed = 0;
  let fullText = "";

  try {
    const q = query({
      prompt: message,
      options: {
        ...(sessionId ? { resume: sessionId } : {}),
        ...(MODEL ? { model: MODEL } : {}),
        systemPrompt: SYSTEM_PROMPT,
        tools: [], // pure chat — no file/shell access
        maxTurns: 1,
        includePartialMessages: true,
        abortController: abort,
      },
    });

    for await (const msg of q) {
      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev.type === "content_block_start" && ev.content_block?.type === "thinking") {
          sse(res, { type: "thinking" });
        } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          streamed += ev.delta.text.length;
          fullText += ev.delta.text;
          sse(res, { type: "text", text: ev.delta.text });
        }
      } else if (msg.type === "result") {
        if (/not logged in/i.test(fullText) || /not logged in/i.test(msg.result ?? "")) {
          sse(res, {
            type: "error",
            message: "Your local Claude isn't signed in yet — run `npm run login` in the project folder once, then try again.",
          });
          break;
        }
        if (msg.subtype === "success") {
          if (streamed === 0 && msg.result) {
            sse(res, { type: "text", text: msg.result });
          }
          sse(res, {
            type: "done",
            sessionId: msg.session_id,
            usage: {
              input: msg.usage?.input_tokens ?? 0,
              output: msg.usage?.output_tokens ?? 0,
            },
          });
        } else {
          const detail = Array.isArray(msg.errors) && msg.errors.length ? msg.errors.join("; ") : msg.subtype;
          sse(res, { type: "error", message: `Claude stopped early (${detail}).` });
        }
      }
    }
  } catch (err) {
    if (!res.writableEnded && !res.destroyed && err?.name !== "AbortError") {
      const hint = /auth|login|credential/i.test(String(err?.message))
        ? " Run `npm run login` in the project folder once to connect your Claude account."
        : "";
      sse(res, { type: "error", message: `Couldn't talk to your local Claude.${hint}` });
      console.error("chat error:", err?.message || err);
    }
  }
  if (!res.writableEnded) res.end();
}

async function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);
  if (req.method === "GET" && req.url === "/api/config") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ model: MODEL || "local claude" }));
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.log(`♥ claudeui running at http://localhost:${PORT} (backend: your local Claude login)`);
});
