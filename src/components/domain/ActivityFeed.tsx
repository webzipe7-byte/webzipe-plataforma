import { Activity } from 'lucide-react';
import { ACTIVITY_ACTIONS } from '../../config/labels';
import type { ActivityLog } from '../../types/database';
import { formatDateTime, timeAgo } from '../../utils/format';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/Misc';

export function ActivityFeed({ items, showBadge = true }: { items: ActivityLog[]; showBadge?: boolean }) {
  if (!items.length) {
    return (
      <EmptyState icon={<Activity size={22} />} title="Sin actividad todavía">
        Aquí aparecerá lo que ocurra en el sistema.
      </EmptyState>
    );
  }
  return (
    <ol className="activity-feed">
      {items.map((item) => {
        const meta = ACTIVITY_ACTIONS[item.action] ?? { label: item.action, tone: 'neutral' as const };
        return (
          <li key={item.id} className={`activity-item tone-${meta.tone}`}>
            <span className="activity-dot" aria-hidden="true" />
            <div className="activity-body">
              <p>{item.description}</p>
              <div className="activity-meta">
                {showBadge && <Badge tone={meta.tone}>{meta.label}</Badge>}
                <time dateTime={item.created_at} title={formatDateTime(item.created_at)}>
                  {timeAgo(item.created_at)}
                </time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
