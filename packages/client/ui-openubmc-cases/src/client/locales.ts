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
  authorizeExecution: '授权本会话执行', revokeExecution: '撤销执行授权', resumeRun: '继续 Run', reconcileRun: '核实执行结果', cancelRun: '取消 Run',
  responseStatus: '阶段结果', responseSummary: '结果说明', responseCompleted: '已完成', responseFailed: '失败', responseCancelled: '取消', responsePartial: '部分完成',
  selectValue: '选择值', onePerLine: '每行一项', jsonValue: '输入 JSON 值', submitResponse: '提交阶段结果',
  invalidPayload: '请检查字段中的 JSON 值', submitFailed: '提交失败，请查看会话中的操作结果', diagnosticReceipt: '诊断证据',
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
  authorizeExecution: 'Authorize this Session', revokeExecution: 'Revoke execution', resumeRun: 'Continue Run', reconcileRun: 'Reconcile execution', cancelRun: 'Cancel Run',
  responseStatus: 'Phase result', responseSummary: 'Result summary', responseCompleted: 'Completed', responseFailed: 'Failed', responseCancelled: 'Cancelled', responsePartial: 'Partial',
  selectValue: 'Select a value', onePerLine: 'One item per line', jsonValue: 'Enter a JSON value', submitResponse: 'Submit phase result',
  invalidPayload: 'Check the JSON values in the response fields.', submitFailed: 'Submission failed. Check the operation result in this conversation.', diagnosticReceipt: 'Diagnostic evidence',
}

/** Locale keys accepted by the Case renderer. */
export type OpenUbmcCasesKey = keyof typeof zh
