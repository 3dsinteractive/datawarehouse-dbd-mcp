#!/usr/bin/env bun
/**
 * MCP server entry — exposes datawarehouse.dbd.go.th as a set of MCP tools.
 *
 * Transport: Streamable HTTP by default, or stdio with --stdio.
 * Tools defined in ./tools.ts. Session bootstrap is lazy:
 * the first tool call spins up a headless Chromium to obtain Incapsula
 * cookies + JWT, then all subsequent calls go through plain Bun fetch.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { tools } from "./tools.ts";

function createServer(): Server {
  const server = new Server(
    { name: "datawarehouse-dbd-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`unknown tool: ${req.params.name}`);
    const input = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.handler(input);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

if (process.argv.includes("--stdio")) {
  await createServer().connect(new StdioServerTransport());
  console.error("[datawarehouse-dbd-mcp] stdio ready");
} else {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  Bun.serve({
    hostname: process.env.HOST ?? "0.0.0.0",
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/health" && request.method === "GET") {
        return new Response("ok");
      }
      if (path !== "/mcp") return new Response("Not Found", { status: 404 });
      // Stateless MCP requires a fresh transport for every request.
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      const server = createServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return transport.handleRequest(request);
    },
  });
  console.error(`[datawarehouse-dbd-mcp] Streamable HTTP ready on port ${port} (/mcp)`);
}
