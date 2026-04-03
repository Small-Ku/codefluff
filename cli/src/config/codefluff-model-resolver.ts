import { getModelForMode } from '@codebuff/common/constants/model-config'

import type { CostMode, Operation } from './codefluff-config'
import type { Model } from '@codebuff/common/constants/model-config'

import { loadCodefluffConfig } from './codefluff-config'

const OPERATION_MAP: Record<string, Operation> = {
  agent: 'agent',
  'file-requests': 'file-requests',
  'check-new-files': 'check-new-files',
}

export function resolveModelForMode(
  costMode: CostMode,
  operation: Operation | string,
): Model {
  const config = loadCodefluffConfig()
  const op = OPERATION_MAP[operation]

  if (!op) {
    throw new Error(`Unknown operation: ${operation}`)
  }

  const modeMapping = config.mapping?.[costMode]
  if (!modeMapping) {
    throw new Error(
      `No model configured for mode "${costMode}" in codefluff config. ` +
        `Add a "${costMode}" entry to the "mapping" section of ~/.config/codefluff/config.json.`,
    )
  }

  const model = modeMapping[op]
  if (!model) {
    throw new Error(
      `No model configured for operation "${op}" in mode "${costMode}". ` +
        `Add "${op}" to the "${costMode}" mapping in ~/.config/codefluff/config.json.`,
    )
  }

  return model
}

export function resolveModelForModeSafe(
  costMode: CostMode,
  operation: Operation | string,
): Model {
  try {
    return resolveModelForMode(costMode, operation)
  } catch {
    return getModelForMode(costMode, operation as Operation)
  }
}
