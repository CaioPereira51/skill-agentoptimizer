import { createServer } from "node:http";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentOptimizer } from "./optimizer.js";
import { FileHistoryStore } from "./history.js";
import { importOtlpTraces } from "./adapters/otlp.js";
import { importCursorOtlp } from "./adapters/cursor-otel.js";
import { mergeSessions } from "./merge.js";

const unzip = promisify(gunzip);

async function bodyFor(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("payload exceeds configured limit");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  return request.headers["content-encoding"] === "gzip" ? unzip(body) : body;
}

export async function startOtlpReceiver({
  host = "127.0.0.1",
  port = 4318,
  historyDir = ".agentoptimizer",
  rawDir,
  maxBytes = 64 * 1024 * 1024,
  cursorBufferMs = 15_000,
  optimizer = new AgentOptimizer()
} = {}) {
  const store = new FileHistoryStore(historyDir);
  let sequence = 0;
  const cursorBuffers = new Map();

  async function persist(sessions) {
    const previousAudits = await store.list();
    const result = optimizer.analyze(sessions, { previousAudits });
    await store.save(result.audit, result.markdown);
  }

  async function flushCursorConversation(id) {
    const buffered = cursorBuffers.get(id);
    if (!buffered) return;
    cursorBuffers.delete(id);
    clearTimeout(buffered.timer);
    await persist(mergeSessions(buffered.sessions));
  }

  function bufferCursorSessions(sessions) {
    for (const session of sessions) {
      const id = session.fields.session?.value;
      if (id == null) continue;
      const key = String(id);
      const buffered = cursorBuffers.get(key) ?? { sessions: [], timer: undefined };
      buffered.sessions.push(session);
      clearTimeout(buffered.timer);
      buffered.timer = setTimeout(() => { void flushCursorConversation(key).catch(() => {}); }, cursorBufferMs);
      cursorBuffers.set(key, buffered);
    }
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || !["/v1/traces", "/v1/logs", "/v1/metrics"].includes(request.url)) {
        response.writeHead(404, { "content-type": "application/json" });
        return response.end(JSON.stringify({ error: "not found" }));
      }
      if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
        response.writeHead(415, { "content-type": "application/json" });
        return response.end(JSON.stringify({ error: "only OTLP/HTTP JSON is supported" }));
      }
      const body = await bodyFor(request, maxBytes);
      const document = JSON.parse(body.toString("utf8"));
      if (rawDir) {
        await mkdir(resolve(rawDir), { recursive: true });
        await writeFile(resolve(rawDir, `${request.url.slice(4)}-${Date.now()}-${++sequence}.json`), `${JSON.stringify(document, null, 2)}\n`, "utf8");
      }
      const isTrace = request.url === "/v1/traces";
      const sessions = isTrace ? importOtlpTraces(document) : importCursorOtlp(document);
      if (!sessions.length) throw new Error(`OTLP payload contained no auditable ${request.url.slice(4)} records with cursor.conversation.id`);
      if (isTrace) {
        await persist(sessions);
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
      } else {
        bufferCursorSessions(sessions);
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ buffered: sessions.length, flushAfterMs: cursorBufferMs }));
      }
    } catch (error) {
      response.writeHead(error.statusCode ?? 400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolveListen);
  });
  const address = server.address();
  return {
    server,
    url: `http://${host}:${address.port}`,
    close: async () => {
      await Promise.all([...cursorBuffers.keys()].map((id) => flushCursorConversation(id)));
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    }
  };
}
