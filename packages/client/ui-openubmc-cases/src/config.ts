/** Shared Host/browser configuration for the optional Case presentation. */
import z from '@deepseek-ai/schemastery'
/** Select the same trusted MCP namespace as the Host Case projection. */
export interface Config {
  /** Trusted MCP namespace used by Host Case projection and native inspections. */
  serverName: string
}
/** Reject ambiguous or missing Runtime namespaces before activation. */
export const Config: z<Config> = z.object({ serverName: z.string().required().pattern(/^[A-Za-z0-9_-]{1,32}$/) })
