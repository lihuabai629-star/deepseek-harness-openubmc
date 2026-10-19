/** Copy owned by the openUBMC Case card. */
export const NS = 'openubmcCases'

/** Simplified Chinese card copy. */
export const zh = {
  runTitle: 'openUBMC Run', receiptTitle: '观察回执', recorded: '已记录的观察', gate: '待提交 Gate', incident: '恢复事件', outcome: '最终结果', facts: '事实', gaps: '缺口', coverage: '覆盖范围', freshness: '时效', results: '观察结果', progress: '进度', next_action: '后续动作', rawResult: '完整回执',
  'title': 'openUBMC Case', 'revision': '修订 {value}', 'status': 'Case 状态：{value}',
  'operation': '操作：{value}', 'failed': '操作失败', 'succeeded': '操作完成',
  'inherited': '继承观察', 'stale': '可能已过期', 'current': '当前会话观察',
  'phase': '阶段', 'evidence': '证据', 'artifacts': '工件', 'actions': '后续动作',
  'refresh': '刷新 Case', 'readEvidence': '读取证据 {value}',
  'unavailable': 'Case 读取命令不可用', 'none': '无', 'unknown': '未报告',
} as const

/** English card copy with the same keys. */
export const en: Record<keyof typeof zh, string> = {
  runTitle: 'openUBMC Run', receiptTitle: 'Observation receipt', recorded: 'Recorded observation', gate: 'Response Gate', incident: 'Recovery Incident', outcome: 'Outcome', facts: 'Facts', gaps: 'Gaps', coverage: 'Coverage', freshness: 'Freshness', results: 'Observation results', progress: 'Progress', next_action: 'Next action', rawResult: 'Complete receipt',
  title: 'openUBMC Case', revision: 'Revision {value}', status: 'Case status: {value}',
  operation: 'Operation: {value}', failed: 'Operation failed', succeeded: 'Operation completed',
  inherited: 'Inherited observation', stale: 'May be stale', current: 'Current-session observation',
  phase: 'Phase', evidence: 'Evidence', artifacts: 'Artifacts', actions: 'Next actions',
  refresh: 'Refresh Case', readEvidence: 'Read evidence {value}',
  unavailable: 'The Case inspection command is unavailable.', none: 'None', unknown: 'Unreported',
}

/** Locale keys accepted by the Case renderer. */
export type OpenUbmcCasesKey = keyof typeof zh
