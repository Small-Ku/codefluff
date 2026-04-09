import { describe, test, expect } from 'bun:test'

import commander from '../basher'

import type { AgentState } from '../types/agent-definition'
import type { ToolResultOutput } from '../types/util-types'

describe('commander agent', () => {
  const createMockAgentState = (): AgentState => ({
    agentId: 'commander-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(commander.id).toBe('basher')
    })

    test('has display name', () => {
      expect(commander.displayName).toBe('Basher')
    })

    test('uses flash-lite model', () => {
      expect(commander.model).toBe('google/gemini-3.1-flash-lite-preview')
    })

    test('has output mode set to last_message', () => {
      expect(commander.outputMode).toBe('last_message')
    })

    test('does not include message history', () => {
      expect(commander.includeMessageHistory).toBe(false)
    })

    test('has run_terminal_command tool', () => {
      expect(commander.toolNames).toContain('run_terminal_command')
      expect(commander.toolNames).toHaveLength(1)
    })
  })

  describe('input schema', () => {
    test('requires command parameter', () => {
      const schema = commander.inputSchema
      const commandProp = schema?.params?.properties?.command
      expect(commandProp && typeof commandProp === 'object' && 'type' in commandProp && commandProp.type).toBe('string')
      expect(schema?.params?.required).toContain('command')
    })

    test('has optional timeout_seconds parameter', () => {
      const schema = commander.inputSchema
      const timeoutProp = schema?.params?.properties?.timeout_seconds
      expect(timeoutProp && typeof timeoutProp === 'object' && 'type' in timeoutProp && timeoutProp.type).toBe('number')
      expect(schema?.params?.required).not.toContain('timeout_seconds')
    })

    test('has optional rawOutput parameter', () => {
      const schema = commander.inputSchema
      const rawOutputProp = schema?.params?.properties?.rawOutput
      expect(rawOutputProp && typeof rawOutputProp === 'object' && 'type' in rawOutputProp && rawOutputProp.type).toBe('boolean')
      expect(schema?.params?.required).not.toContain('rawOutput')
    })

    test('has optional shell parameter', () => {
      const schema = commander.inputSchema
      const shellProp = schema?.params?.properties?.shell
      expect(shellProp && typeof shellProp === 'object' && 'type' in shellProp && shellProp.type).toBe('string')
      expect(schema?.params?.required).not.toContain('shell')
    })

    test('has prompt parameter', () => {
      expect(commander.inputSchema?.prompt?.type).toBe('string')
    })
  })

  describe('handleSteps', () => {
    test('returns error when no command provided', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toContain('Error')
      expect(toolCall.input.output).toContain('command')
    })

    test('yields run_terminal_command with basic command', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la' },
      })

      const result = generator.next()

      const isWindows = process.platform === 'win32'

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'ls -la',
          ...(isWindows ? { shell: 'pwsh' } : {}),
        },
      })
    })

    test('yields run_terminal_command with explicit shell', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'dir', shell: 'pwsh' },
      })

      const result = generator.next()

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'dir',
          shell: 'pwsh',
        },
      })
    })

    test('yields run_terminal_command with timeout', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'sleep 10', timeout_seconds: 60 },
      })

      const result = generator.next()

      const isWindows = process.platform === 'win32'

      expect(result.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'sleep 10',
          timeout_seconds: 60,
          ...(isWindows ? { shell: 'pwsh' } : {}),
        },
      })
    })

    test('yields set_output with raw result when rawOutput is true', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo hello', rawOutput: true },
      })

      // First yield is the command
      generator.next()

      // Second yield should be set_output with the result
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: { stdout: 'hello' } }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: { stdout: string } }
        includeToolCall?: boolean
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toEqual({ stdout: 'hello' })
      expect(toolCall.includeToolCall).toBe(false)
      expect(result.done).toBe(false)

      // Next should be done
      const final = generator.next()
      expect(final.done).toBe(true)
    })

    test('yields STEP for model analysis when rawOutput is false', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'ls -la', rawOutput: false },
      })

      // First yield is the command
      generator.next()

      // Second yield should be STEP for model analysis
      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [
          { type: 'json' as const, value: { stdout: 'file1.txt\nfile2.txt' } },
        ],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      expect(result.value).toBe('STEP')
    })

    test('handles empty tool result gracefully', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test', rawOutput: true },
      })

      // First yield is the command
      generator.next()

      // Second yield with empty result
      const result = generator.next({
        agentState: createMockAgentState(),
        toolResult: [] as ToolResultOutput[],
        stepsComplete: true,
      })

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toBe('')
    })

    test('handles string json tool result', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'echo test', rawOutput: true },
      })

      // First yield is the command
      generator.next()

      const mockToolResult = {
        agentState: createMockAgentState(),
        toolResult: [{ type: 'json' as const, value: 'plain text output' }],
        stepsComplete: true,
      }
      const result = generator.next(mockToolResult)

      const toolCall = result.value as {
        toolName: string
        input: { output: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.output).toBe('plain text output')
    })

    test('falls back to powershell when pwsh is not found (no explicit shell)', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }

      const generator = commander.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: { command: 'Get-ChildItem' },
      })

      const isWindows = process.platform === 'win32'

      const first = generator.next()
      expect(first.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          ...(isWindows ? { shell: 'pwsh' } : {}),
        },
      })

      // This fallback path is Windows-specific.
      if (!isWindows) {
        return
      }

      const mockPwshNotFound = {
        agentState: createMockAgentState(),
        toolResult: [
          {
            type: 'json' as const,
            value: {
              stdout: '',
              stderr:
                'PowerShell Core (pwsh) was requested but not found on this Windows system.',
              exitCode: 1,
            },
          },
        ],
        stepsComplete: true,
      }

      const second = generator.next(mockPwshNotFound)
      expect(second.value).toEqual({
        toolName: 'run_terminal_command',
        input: {
          command: 'Get-ChildItem',
          shell: 'powershell',
        },
      })
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = commander.handleSteps!.toString()

      // Verify it's a valid generator function string
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      // Should be able to create a new function from it
      const isolatedFunction = new Function(`return (${handleStepsString})`)()
      expect(typeof isolatedFunction).toBe('function')
    })
  })

  describe('system prompt', () => {
    test('contains command analysis instructions', () => {
      expect(commander.systemPrompt).toContain('terminal command')
      expect(commander.systemPrompt).toContain('output')
    })

    test('contains concise description requirement', () => {
      expect(commander.systemPrompt).toContain('concise')
    })
  })

  describe('instructions prompt', () => {
    test('instructs not to use tools', () => {
      expect(commander.instructionsPrompt).toContain('Do not use any tools')
    })

    test('mentions analyzing command output', () => {
      expect(commander.instructionsPrompt).toContain('command')
      expect(commander.instructionsPrompt).toContain('output')
    })
  })
})
