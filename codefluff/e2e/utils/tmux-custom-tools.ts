import { z } from 'zod/v4'

import { CodefluffSession } from './codefluff-session'

import type { ZodType } from 'zod/v4'

interface CodefluffToolDefinition {
  toolName: string
  description: string
  inputSchema: ZodType
  endsAgentStep: boolean
  exampleInputs: Record<string, unknown>[]
  execute: (input: Record<string, unknown>) => Promise<ToolOutput>
}

type ToolOutput = { type: 'json'; value: Record<string, unknown> }[]

/**
 * Creates custom tool definitions that allow a Codebuff SDK agent
 * to interact with a Codefluff CLI binary via tmux.
 *
 * Returns the tools array and a cleanup function to call in afterEach.
 *
 * Usage:
 * ```ts
 * const { tools, cleanup } = createCodefluffTmuxTools(binaryPath)
 * // ... pass tools to client.run({ customToolDefinitions: tools })
 * // ... in afterEach: await cleanup()
 * ```
 */
export function createCodefluffTmuxTools(binaryPath: string): {
  tools: CodefluffToolDefinition[]
  cleanup: () => Promise<void>
} {
  let session: CodefluffSession | null = null

  const startTool: CodefluffToolDefinition = {
    toolName: 'start_codefluff',
    description:
      'Start the Codefluff CLI binary in a tmux terminal session. Call this first before interacting with Codefluff.',
    inputSchema: z.object({}),
    endsAgentStep: true,
    exampleInputs: [{}],
    execute: async (): Promise<ToolOutput> => {
      if (session) {
        return [
          {
            type: 'json',
            value: {
              error: 'Session already running',
              sessionName: session.name,
            },
          },
        ]
      }
      session = await CodefluffSession.start(binaryPath)
      await session.waitForReady()
      const initialOutput = await session.capture()
      return [
        {
          type: 'json',
          value: {
            started: true,
            sessionName: session.name,
            initialOutput,
          },
        },
      ]
    },
  }

  const sendInputTool: CodefluffToolDefinition = {
    toolName: 'send_to_codefluff',
    description:
      'Send text input to the running Codefluff CLI. The text is sent as if typed by the user and Enter is pressed.',
    inputSchema: z.object({
      text: z.string().describe('Text to send to Codefluff'),
    }),
    endsAgentStep: false,
    exampleInputs: [{ text: '/help' }],
    execute: async (input): Promise<ToolOutput> => {
      const text = (input as { text: string }).text
      if (!session) {
        return [
          {
            type: 'json',
            value: { error: 'No session running. Call start_codefluff first.' },
          },
        ]
      }
      await session.send(text)
      return [{ type: 'json', value: { sent: true, text } }]
    },
  }

  const captureOutputTool: CodefluffToolDefinition = {
    toolName: 'capture_codefluff_output',
    description:
      'Capture the current terminal output from the running Codefluff CLI session. ' +
      'Use waitSeconds to wait before capturing (useful after sending a command).',
    inputSchema: z.object({
      waitSeconds: z
        .number()
        .optional()
        .describe('Seconds to wait before capturing (default: 0)'),
    }),
    endsAgentStep: true,
    exampleInputs: [{ waitSeconds: 2 }],
    execute: async (input): Promise<ToolOutput> => {
      const waitSeconds = (input as { waitSeconds?: number }).waitSeconds
      if (!session) {
        return [
          {
            type: 'json',
            value: { error: 'No session running. Call start_codefluff first.' },
          },
        ]
      }
      const output = await session.capture(waitSeconds)
      return [{ type: 'json', value: { output } }]
    },
  }

  const stopTool: CodefluffToolDefinition = {
    toolName: 'stop_codefluff',
    description:
      'Stop the running Codefluff CLI session and clean up resources. Always call this when done testing.',
    inputSchema: z.object({}),
    endsAgentStep: true,
    exampleInputs: [{}],
    execute: async (): Promise<ToolOutput> => {
      if (!session) {
        return [
          { type: 'json', value: { stopped: true, wasRunning: false } },
        ]
      }
      await session.stop()
      session = null
      return [
        { type: 'json', value: { stopped: true, wasRunning: true } },
      ]
    },
  }

  const cleanup = async () => {
    if (session) {
      await session.stop()
      session = null
    }
  }

  return {
    tools: [startTool, sendInputTool, captureOutputTool, stopTool],
    cleanup,
  }
}
