import { getBaseEnv } from '@codebuff/common/env-process'

export type CliEnv = {
  CODEFLUFF_MODE?: string
} & ReturnType<typeof getBaseEnv>

export const getCliEnv = (): CliEnv => ({
  ...getBaseEnv(),
  CODEFLUFF_MODE: process.env.CODEFLUFF_MODE,
})
