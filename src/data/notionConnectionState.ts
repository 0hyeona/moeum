import type { ActivityState } from './activity';

export function needsNotionConnection(state: ActivityState): boolean {
  if (state.status === 'disconnected') return true;
  if (state.status !== 'error') return false;
  return /Notion\s*계정\s*연결이?\s*필요|Notion.*(?:재연결|다시 연결)|(?:페이지|Notion).*(?:접근 권한|권한이 없|승인.*필요|공유.*필요)|(?:unauthorized|invalid_token|restricted_resource|notion.*not connected)/i.test(state.error);
}
