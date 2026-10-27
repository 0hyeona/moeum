import { createContext, useContext } from 'react';
import type { AuthUser } from '../api/auth';

export const AuthContext = createContext<{
  user: AuthUser;
  signOut: () => Promise<void>;
  leaving: boolean;
  error: string;
} | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('인증 정보가 필요합니다.');
  return auth;
}
