/** Plugin-owned Session associations; Runtime retains every domain state transition. @module */
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { SessionLogOffset, SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { createRuntimeController } from '@deepseek-ai/dsh-experimental-openubmc-runtime'

type Controller = ReturnType<typeof createRuntimeController>
type State = ReturnType<Controller['projection']['init']>
const header = z.object({ schema: z.literal('dsh-openubmc/session-authority/v1'), sessionId: z.string(),
  stateVersion: z.number().int(), sequence: z.number().int().nonnegative(), revision: z.number().int().nonnegative() })

/** Durable associations and permissions for one trusted Session identity. */
export class SessionAuthority {
  constructor(private readonly directory: string, private readonly controller: Controller, private readonly lockWaitMs: number,
    private readonly hasHistory: (session: Session, currentCall?: ToolCallId) => boolean) {}

  private path(session: Session): string {
    return join(this.directory, createHash('sha256').update(session.id).digest('hex') + '.json')
  }

  /**
   * Exclude another execute or recovery while a caller is still waiting.
   * @param session - Trusted calling Session.
   * @param operation - Work whose completed promise releases the execution lease.
   * @returns The operation result; a live competing caller fails closed.
   */
  async exclusive<T>(session: Session, operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    return withFileLock(this.path(session) + '.execution', operation, { waitMs: this.lockWaitMs })
  }

  /**
   * Read validated authority without inferring permission from inherited conversations.
   * @param session - Trusted Host Session.
   * @param currentCall - New call that may already have a Host tool/call record.
   * @returns Private authority record; missing history with prior effects fails closed.
   */
  read(session: Session, currentCall?: ToolCallId) {
    let raw: string
    try { raw = readFileSync(this.path(session), 'utf8') } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      if (this.hasHistory(session, currentCall)) {
        throw new Error('openUBMC Session authority is missing. Restore its authority directory before continuing this Session.')
      }
      return { schema: 'dsh-openubmc/session-authority/v1' as const, sessionId: session.id,
        stateVersion: this.controller.projection.stateVersion, sequence: 0, revision: 0,
        state: this.controller.projection.init(session.header, SessionLogOffset(0)) }
    }
    const parsed = header.extend({ state: this.controller.projection.stateSchema }).parse(JSON.parse(raw))
    if (parsed.sessionId !== session.id || parsed.stateVersion !== this.controller.projection.stateVersion) {
      throw new Error('openUBMC Session authority has an incompatible identity or version. Restore a compatible backup.')
    }
    return parsed
  }

  /**
   * Serialize one authority transaction across Hosts and sync it before returning.
   * @param session - Trusted Host Session; fork children use separate records.
   * @param currentCall - Optional new call already recorded by the Host.
   * @param mutate - Synchronous state update, executed after validation under the lock.
   * @returns The committed state.
   */
  async update(session: Session, currentCall: ToolCallId | undefined, mutate: (state: State) => State): Promise<State> {
    return (await this.transaction(session, currentCall, mutate, state => state)).value
  }

  /**
   * Commit the final permission check and submit IO before releasing the writer lock.
   * @param session - Trusted calling Session.
   * @param currentCall - Calling operation identity.
   * @param prepare - Final permission check under the writer lock.
   * @param send - Submit once after syncing; its settlement does not hold the writer lock.
   * @returns The provider result; rejection retains the already-recorded pending call.
   */
  async dispatch<T>(session: Session, currentCall: ToolCallId, prepare: (state: State) => State, send: () => Promise<T>): Promise<T> {
    const submitted = await this.transaction(session, currentCall, prepare, () => ({
      settlement: send().then(value => ({ value }), (error: unknown) => ({ error })),
    }))
    const result = await submitted.value.settlement
    if ('error' in result) throw result.error
    return result.value
  }

  private async transaction<T>(session: Session, currentCall: ToolCallId | undefined,
    mutate: (state: State) => State, committed: (state: State) => T): Promise<{ state: State; value: T }> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    return withFileLock(this.path(session), async () => {
      const record = this.read(session, currentCall)
      const state = this.controller.projection.stateSchema.parse(mutate(record.state))
      const temporary = this.path(session) + '.' + randomUUID() + '.tmp'
      try {
        const file = await open(temporary, 'wx', 0o600)
        try {
          await file.writeFile(JSON.stringify({ ...record, sequence: record.sequence + 1, revision: record.revision + 1, state }) + '\n')
          await file.sync()
        } finally { await file.close() }
        await rename(temporary, this.path(session))
        const directory = await open(this.directory, 'r')
        try { await directory.sync() } finally { await directory.close() }
      } finally { await rm(temporary, { force: true }) }
      return { state, value: committed(state) }
    }, { waitMs: this.lockWaitMs })
  }

  /**
   * Reuse the native authority reducer for a private association update.
   * @param state - Validated association state.
   * @param event - Typed reducer input; never appended as a custom Host event.
   * @returns Updated association state.
   */
  fold(state: State, event: SessionEvent): State {
    return this.controller.projection.apply(state, event)
  }
}

/**
 * Stamp a private reducer input independently of the Host's conversation sequence.
 * @param event - Typed reducer data without a timestamp or sequence.
 * @returns A complete reducer input; not a persisted Host Session event.
 */
export function authorityInput<T extends SessionEvent['type']>(event: Omit<SessionEvent<T>, 'seq' | 'time'>): SessionEvent<T> {
  return { ...event, seq: SessionSeq(0), time: 0 } as SessionEvent<T>
}
