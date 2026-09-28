import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Employee, Role } from '../types/database';
import { fetchOwnProfile, signInWithUsername, signOut as apiSignOut } from '../services/auth';
import { touchActivity } from '../services/employees';

type AuthState =
  | { status: 'loading'; session: null; profile: null }
  | { status: 'signedOut'; session: null; profile: null; notice?: string }
  | { status: 'signedIn'; session: Session; profile: Employee };

type AuthContextValue = AuthState & {
  signIn: (username: string, password: string) => Promise<Role>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isStaff: boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVITY_PING_MS = 4 * 60 * 1000;
const IDLE_LOGOUT_MS = 12 * 60 * 60 * 1000; // cierre automático tras 12 h sin uso

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, profile: null });
  const lastInteraction = useRef(Date.now());

  const loadProfile = useCallback(async (session: Session | null) => {
    if (!session) {
      setState((prev) => ({
        status: 'signedOut',
        session: null,
        profile: null,
        notice: prev.status === 'signedOut' ? prev.notice : undefined,
      }));
      return;
    }
    try {
      const profile = await fetchOwnProfile(session.user.id);
      if (!profile || profile.status !== 'active') {
        await apiSignOut();
        setState({
          status: 'signedOut',
          session: null,
          profile: null,
          notice: 'Tu cuenta no está activa. Contacta al administrador.',
        });
        return;
      }
      setState({ status: 'signedIn', session, profile });
    } catch {
      setState((prev) =>
        prev.status === 'signedIn'
          ? { ...prev, session } // error de red: mantener la sesión actual
          : { status: 'signedOut', session: null, profile: null, notice: 'No se pudo cargar tu perfil. Intenta de nuevo.' },
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) void loadProfile(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED') {
        setState((prev) => (prev.status === 'signedIn' && session ? { ...prev, session } : prev));
        return;
      }
      // Diferido para no llamar a Supabase dentro del callback de auth.
      setTimeout(() => mounted && loadProfile(session), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Última actividad + cierre de sesión por inactividad prolongada.
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    const mark = () => (lastInteraction.current = Date.now());
    const events = ['pointerdown', 'keydown', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    void touchActivity();
    const timer = setInterval(() => {
      if (Date.now() - lastInteraction.current > IDLE_LOGOUT_MS) {
        void apiSignOut();
        return;
      }
      if (document.visibilityState === 'visible') void touchActivity();
    }, ACTIVITY_PING_MS);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [state.status]);

  const signIn = useCallback(async (username: string, password: string) => {
    const role = await signInWithUsername(username, password);
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
    return role;
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setState({ status: 'signedOut', session: null, profile: null });
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(() => {
    const role = state.status === 'signedIn' ? state.profile.role : null;
    return {
      ...state,
      signIn,
      signOut,
      refreshProfile,
      isStaff: role === 'admin' || role === 'supervisor',
      isAdmin: role === 'admin',
    };
  }, [state, signIn, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** Perfil garantizado (usar solo dentro de rutas protegidas). */
export function useProfile(): Employee {
  const auth = useAuth();
  if (auth.status !== 'signedIn') throw new Error('useProfile requiere una sesión activa');
  return auth.profile;
}
