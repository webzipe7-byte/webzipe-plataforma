import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../../auth/AuthProvider';
import { useRealtime } from '../../hooks/useRealtime';
import { getSettings } from '../../services/admin';
import { getMySummary } from '../../services/communications';
import type { MySummary, Settings } from '../../types/database';
import { useToast } from '../ui/Feedback';

type WorkspaceValue = {
  summary: MySummary | null;
  refreshSummary: () => Promise<void>;
  settings: Settings;
  reloadSettings: () => Promise<void>;
  /** Se incrementa cuando llega un cambio en vivo (para recargar listas abiertas). */
  liveVersion: number;
};

const DEFAULT_SETTINGS: Settings = {
  default_country_code: '57',
  allow_employee_contacts: true,
  invitation_hours: 72,
  whatsapp_template: 'Hola {nombre}, te escribo de WebZipe.',
  contact_categories: [],
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * Estado compartido del área de trabajo: contadores de no leídos, configuración
 * y notificaciones en vivo (Realtime + consulta periódica de respaldo).
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const toast = useToast();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<MySummary | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [liveVersion, setLiveVersion] = useState(0);
  const lastCounts = useRef<{ m: number; a: number } | null>(null);

  const refreshSummary = useCallback(async () => {
    try {
      const s = await getMySummary();
      setSummary(s);
      const prev = lastCounts.current;
      if (prev) {
        if (s.unread_messages > prev.m) {
          toast.info('Tienes una nueva comunicación', 'El administrador te envió un mensaje.', {
            label: 'Ver mensajes',
            onClick: () => navigate('/app/comunicaciones'),
          });
        }
        if (s.unread_announcements > prev.a) {
          toast.info('Nueva actualización publicada', 'Hay información nueva para el equipo.', {
            label: 'Ver actualizaciones',
            onClick: () => navigate('/app/actualizaciones'),
          });
        }
      }
      lastCounts.current = { m: s.unread_messages, a: s.unread_announcements };
    } catch {
      // Sin conexión: se reintenta en el siguiente ciclo.
    }
  }, [toast, navigate]);

  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch {
      // se mantienen los valores por defecto
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
    void reloadSettings();
    const timer = setInterval(() => document.visibilityState === 'visible' && refreshSummary(), 60_000);
    const onFocus = () => void refreshSummary();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshSummary, reloadSettings]);

  const onLive = useCallback(() => {
    setLiveVersion((v) => v + 1);
    void refreshSummary();
  }, [refreshSummary]);

  useRealtime('message_recipients', onLive, `employee_id=eq.${profile.id}`);
  useRealtime('announcements', onLive);
  useRealtime('tasks', onLive, `assigned_to=eq.${profile.id}`);

  return (
    <WorkspaceContext.Provider value={{ summary, refreshSummary, settings, reloadSettings, liveVersion }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  return ctx;
}
