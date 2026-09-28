import { useState, type ReactElement } from 'react';
import { CalendarClock, CheckCircle2, MessageSquareText, Pause, Play, RotateCcw, UserRound } from 'lucide-react';
import { TASK_PRIORITY, TASK_STATUS } from '../../config/labels';
import type { Task, TaskStatus } from '../../types/database';
import { dueLabel, formatDate, isOverdue } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { OptionBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { TextArea } from '../ui/Field';
import { ContactActions } from './ContactActions';
import { useWorkspace } from '../layout/WorkspaceProvider';

type Props = {
  task: Task;
  onStatus: (task: Task, status: TaskStatus, note?: string | null) => Promise<void>;
};

const NEXT_ACTIONS: Record<TaskStatus, { status: TaskStatus; label: string; icon: ReactElement; variant: 'primary' | 'secondary' | 'ghost' | 'gold' }[]> = {
  pendiente: [
    { status: 'en_proceso', label: 'Empezar', icon: <Play size={15} />, variant: 'primary' },
    { status: 'completada', label: 'Completar', icon: <CheckCircle2 size={15} />, variant: 'secondary' },
  ],
  en_proceso: [
    { status: 'completada', label: 'Completar', icon: <CheckCircle2 size={15} />, variant: 'primary' },
    { status: 'pausada', label: 'Pausar', icon: <Pause size={15} />, variant: 'ghost' },
  ],
  pausada: [{ status: 'en_proceso', label: 'Reanudar', icon: <Play size={15} />, variant: 'primary' }],
  completada: [{ status: 'pendiente', label: 'Reabrir', icon: <RotateCcw size={15} />, variant: 'ghost' }],
};

export function TaskCard({ task, onStatus }: Props) {
  const { settings } = useWorkspace();
  const [busy, setBusy] = useState<TaskStatus | null>(null);
  const [noteFor, setNoteFor] = useState<TaskStatus | null>(null);
  const [note, setNote] = useState(task.employee_note ?? '');
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(task.due_date, task.status);

  const change = async (status: TaskStatus, withNote?: string | null) => {
    setBusy(status);
    try {
      await onStatus(task, status, withNote);
      setNoteFor(null);
    } finally {
      setBusy(null);
    }
  };

  const longDescription = (task.description?.length ?? 0) > 180;

  return (
    <article className={`task-card status-${task.status} ${overdue ? 'is-overdue' : ''}`}>
      <div className="task-card-top">
        <OptionBadge value={task.status} map={TASK_STATUS} />
        <OptionBadge value={task.priority} map={TASK_PRIORITY} dot={false} />
        <span className={`task-due ${overdue ? 'is-overdue' : ''}`}>
          <CalendarClock size={14} />
          {task.status === 'completada' ? `Completada ${formatDate(task.completed_at)}` : dueLabel(task.due_date)}
        </span>
      </div>

      <h3 className="task-title">{task.title}</h3>
      {task.description && (
        <p className={`task-description ${longDescription && !expanded ? 'is-clamped' : ''}`}>
          {task.description}
          {longDescription && (
            <button type="button" className="text-link inline" onClick={() => setExpanded((v) => !v)}>
              {expanded ? ' Ver menos' : ' Ver más'}
            </button>
          )}
        </p>
      )}

      {(task.client_name || task.phone) && (
        <div className="task-client">
          <div className="task-client-info">
            <UserRound size={15} />
            <span>
              {task.client_name && <strong>{task.client_name}</strong>}
              {task.phone && <span className="mono">{formatPhone(task.phone, settings.default_country_code)}</span>}
            </span>
          </div>
          {task.phone && <ContactActions phone={task.phone} name={task.client_name} compact />}
        </div>
      )}

      {task.employee_note && (
        <p className="task-note">
          <MessageSquareText size={14} /> {task.employee_note}
        </p>
      )}

      <footer className="task-card-footer">
        <span className="task-assigned">Asignada {formatDate(task.assigned_at)}</span>
        <div className="task-buttons">
          <Button size="sm" variant="ghost" icon={<MessageSquareText size={15} />} onClick={() => setNoteFor(task.status)} title="Agregar nota" aria-label="Agregar nota" />
          {NEXT_ACTIONS[task.status].map((a) => (
            <Button
              key={a.status}
              size="sm"
              variant={a.variant}
              icon={a.icon}
              loading={busy === a.status}
              disabled={!!busy}
              onClick={() => (a.status === 'completada' ? setNoteFor('completada') : change(a.status))}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </footer>

      <Modal
        open={!!noteFor}
        onClose={() => setNoteFor(null)}
        busy={!!busy}
        size="sm"
        title={noteFor === 'completada' && task.status !== 'completada' ? '¿Marcar la tarea como completada?' : 'Nota para el administrador'}
        description={task.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteFor(null)} disabled={!!busy}>
              Cancelar
            </Button>
            <Button variant="primary" loading={!!busy} onClick={() => noteFor && change(noteFor, note)}>
              {noteFor === 'completada' && task.status !== 'completada' ? 'Sí, completar' : 'Guardar nota'}
            </Button>
          </>
        }
      >
        <TextArea
          label="Nota (opcional)"
          hint="Ej. «Propuesta enviada, responde el lunes». El administrador la verá."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </Modal>
    </article>
  );
}
