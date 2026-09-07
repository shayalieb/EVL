export function quickBooksPilotHealth({ accessEnabled, connectionStatus, issueCount = 0, lastSuccessfulSyncAt = null }) {
  if (!accessEnabled) return 'not_enabled';
  if (!connectionStatus) return 'awaiting_connection';
  if (connectionStatus !== 'active') return 'connection_issue';
  if (issueCount > 0) return 'needs_attention';
  if (!lastSuccessfulSyncAt) return 'ready';
  return 'healthy';
}

