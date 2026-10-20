/** Deployment configuration for the installable openUBMC bundle. @module */
import z from '@deepseek-ai/schemastery'

/** Local interpreters, private data and caller wait limits. */
export interface Config {
  /** Python interpreter used by the packaged Runtime. */
  python: string
  /** Standalone Node executable; required in Electron and single-executable hosts. */
  node?: string
  /** Private credential selector; defaults to the selected DSH home's credentials.env. */
  credentialsFile?: string
  /** Durable Runtime data; defaults to the selected DSH home's openubmc-agent-state. */
  stateDir?: string
  /** Maximum wait for a concurrent Session authority update, in milliseconds. */
  authorityLockWaitMs: number
  /** Whether the profile exposes the packaged knowledge-base MCP. */
  kbEnabled: boolean
  /** Maximum execute wait in seconds. */
  operationDeadlineSeconds: number
  /** Maximum observe wait in seconds. */
  observationDeadlineSeconds: number
  /** Transport allowance after the Runtime caller wait. */
  completionGraceMs: number
  /** MCP transport wait in milliseconds. */
  toolCallTimeoutMs: number
}

/** Deployment settings remain editable in the profile's own patch. */
export const Config: z<Config> = z.object({
  python: z.string().min(1).default('python3'),
  node: z.string().min(1), credentialsFile: z.string().min(1), stateDir: z.string().min(1),
  authorityLockWaitMs: z.number().min(1).max(60000).default(1000),
  kbEnabled: z.boolean().default(true),
  operationDeadlineSeconds: z.number().min(1).max(120).default(120),
  observationDeadlineSeconds: z.number().min(1).max(2_147_483).default(180),
  completionGraceMs: z.number().min(1).max(2_147_483_647).default(10000),
  toolCallTimeoutMs: z.number().min(1).max(2_147_483_647).default(190000),
})
