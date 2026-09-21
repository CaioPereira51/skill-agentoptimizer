import { createServer } from "node:http";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AgentOptimizer } from "./optimizer.js";
import { FileHistoryStore } from "./history.js";
import { importOtlpTraces } from "./adapters/otlp.js";

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
  optimizer = new AgentOptimizer()
} = {}) {
  const store = new FileHistoryStore(historyDir);
  let sequence = 0;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/v1/traces") {
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
        await writeFile(resolve(rawDir, `traces-${Date.now()}-${++sequence}.json`), `${JSON.stringify(document, null, 2)}\n`, "utf8");
      }
      const sessions = importOtlpTraces(document);
      if (!sessions.length) throw new Error("OTLP payload contained no trace spans");
      const previousAudits = await store.list();
      const result = optimizer.analyze(sessions, { previousAudits });
      await store.save(result.audit, result.markdown);
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
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
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  };
}
