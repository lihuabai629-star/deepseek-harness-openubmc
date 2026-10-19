/** Runtime-issued continuation bindings used by the native Run controls. @module */
import { z } from 'zod'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

const object = z.record(z.string(), z.json())
const gateSchema = z.object({
  gate_id: z.string().min(1), gate_version: z.number().int().positive(), schema_digest: z.string().min(1),
  submission_id: z.string().min(1).optional(), name: z.string(), input_schema: object,
})

/** Validated Gate fields copied unchanged into a response. */
export type ResponseGate = z.infer<typeof gateSchema>

/**
 * Read a response Gate from persisted Runtime JSON.
 * @param value - Returned Gate.
 * @returns validated fields, or null.
 */
export function responseGate(value: JsonValue | undefined): ResponseGate | null {
  const parsed = gateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Copy the current Gate binding.
 * @param gate - Validated Runtime Gate.
 * @returns identity fields without form data.
 */
export function gateBinding(gate: ResponseGate): Record<string, JsonValue> {
  return { gate_id: gate.gate_id, gate_version: gate.gate_version, schema_digest: gate.schema_digest,
    ...(gate.submission_id === undefined ? {} : { submission_id: gate.submission_id }) }
}

/**
 * Read JSON object properties for a Runtime form.
 * @param value - JSON schema object.
 * @returns its property schemas.
 */
export function properties(value: JsonValue | undefined): Record<string, JsonValue> {
  const parsed = object.safeParse(value)
  if (!parsed.success) return {}
  const fields = object.safeParse(parsed.data.properties)
  return fields.success ? fields.data : {}
}

/**
 * Read one field schema.
 * @param value - Runtime schema field.
 * @returns object metadata, or an empty object.
 */
export function fieldSchema(value: JsonValue): Record<string, JsonValue> {
  const parsed = object.safeParse(value)
  return parsed.success ? parsed.data : {}
}
