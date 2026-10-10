/** Copy owned by the openUBMC Case card. */
export const NS = 'openubmcCases'

/** Simplified Chinese card copy. */
export const zh = {
  'title': 'openUBMC Case', 'revision': '修订 {value}', 'status': 'Case 状态：{value}',
  'operation': '操作：{value}', 'failed': '操作失败', 'succeeded': '操作完成',
  'inherited': '继承观察', 'stale': '可能已过期', 'current': '当前会话观察',
  'phase': '阶段', 'evidence': '证据', 'artifacts': '工件', 'actions': '后续动作',
  'refresh': '刷新 Case', 'readEvidence': '读取证据 {value}',
  'unavailable': 'Case 读取命令不可用', 'none': '无', 'unknown': '未报告',
} as const

/** English card copy with the same keys. */
export const en: Record<keyof typeof zh, string> = {
  title: 'openUBMC Case', revision: 'Revision {value}', status: 'Case status: {value}',
  operation: 'Operation: {value}', failed: 'Operation failed', succeeded: 'Operation completed',
  inherited: 'Inherited observation', stale: 'May be stale', current: 'Current-session observation',
  phase: 'Phase', evidence: 'Evidence', artifacts: 'Artifacts', actions: 'Next actions',
  refresh: 'Refresh Case', readEvidence: 'Read evidence {value}',
  unavailable: 'The Case inspection command is unavailable.', none: 'None', unknown: 'Unreported',
}

/** Locale keys accepted by the Case renderer. */
export type OpenUbmcCasesKey = keyof typeof zh
