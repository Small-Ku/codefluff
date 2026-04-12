/**
 * Codefluff mock server — lightweight HTTP server that stubs Codebuff backend endpoints.
 *
 * Allows the full SDK code path to run unchanged in codefluff mode,
 * without scattering isCodefluff conditionals across many files.
 *
 * Endpoints:
 *   GET  /api/healthz                      → { status: "ok" }
 *   GET  /api/v1/me                        → { id: "codefluff-local" }
 *   POST /api/v1/agent-runs                → { runId: <uuid> }
 *   POST /api/v1/agent-steps               → 200 OK
 *   POST /api/v1/agent-runs/:id/finish     → 200 OK
 *   POST /api/v1/token-count               → { inputTokens: 0, outputTokens: 0 }
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'

export type MockServerHandle = {
  url: string
  close: () => Promise<void>
}

export function startCodefluffMockServer(): Promise<MockServerHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'application/json')

      const url = req.url ?? ''
      const method = req.method ?? 'GET'

      if (method === 'GET' && url === '/api/healthz') {
        res.writeHead(200)
        res.end(JSON.stringify({ status: 'ok' }))
        return
      }

      if (method === 'GET' && url.startsWith('/api/v1/me')) {
        res.writeHead(200)
        res.end(
          JSON.stringify({ id: 'codefluff-local', email: 'local@codefluff' }),
        )
        return
      }

      if (method === 'POST' && url === '/api/v1/agent-runs') {
        res.writeHead(200)
        res.end(JSON.stringify({ runId: crypto.randomUUID() }))
        return
      }

      if (method === 'POST' && url === '/api/v1/agent-steps') {
        res.writeHead(200)
        res.end(JSON.stringify({}))
        return
      }

      if (
        method === 'POST' &&
        url.match(/^\/api\/v1\/agent-runs\/[^/]+\/finish$/)
      ) {
        res.writeHead(200)
        res.end(JSON.stringify({}))
        return
      }

      if (method === 'POST' && url === '/api/v1/token-count') {
        res.writeHead(200)
        res.end(JSON.stringify({ inputTokens: 0, outputTokens: 0 }))
        return
      }

      // Catch-all: return 200 for any other endpoint, but log it
      // Needed to be 200 for the codefluff-cli to work with the mock server, like fetching LLM response.
      console.warn(
        `[codefluff-mock-server] Unhandled endpoint: ${method} ${url} — returning 200. ` +
          `If codefluff behavior is incorrect, this endpoint may need a proper mock handler.`,
      )
      res.writeHead(200)
      res.end(JSON.stringify({}))
    })

    server.on('error', reject)

    // Listen on random available port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || !address) {
        reject(new Error('Failed to get mock server address'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((resolve) => {
            server.close(() => resolve())
          }),
      })
    })
  })
}
