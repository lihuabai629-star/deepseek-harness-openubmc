/** Parsing of durable openUBMC Agent gateway results. @module */
import { z } from 'zod'

const gateway = 'openubmc.target-runtime.v1/agent-gateway-v1'
/** Runtime Turn JSON, including Gate, Incident, Outcome and error details. */
export const runTurnSchema = z.object({
  schema: z.literal(`${gateway}/turn`), run_id: z.string().min(1), state: z.string().min(1),
  gate: z.record(z.string(), z.json()).nullable().optional(),
  incident: z.record(z.string(), z.json()).nullable().optional(),
}).catchall(z.json())
/** Runtime ObservationReceipt JSON, including coverage, freshness and evidence. */
export const observationReceiptSchema = z.object({
  schema: z.literal(`${gateway}/observation-receipt`), receipt_id: z.string().min(1), status: z.string().min(1),
}).catchall(z.json())
