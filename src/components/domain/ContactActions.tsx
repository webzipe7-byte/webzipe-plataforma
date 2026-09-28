import { Copy, Globe, Phone, Sparkles } from 'lucide-react';
import { LinkButton, Button } from '../ui/Button';
import { useToast } from '../ui/Feedback';
import { useWorkspace } from '../layout/WorkspaceProvider';
import { useProfile } from '../../auth/AuthProvider';
import { externalUrl, firstName } from '../../utils/format';
import { fillTemplate, formatPhone, telLink, whatsappLink } from '../../utils/phone';

export function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path
        d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.87 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.85 1h.01A7.94 7.94 0 0 0 20 12.06a7.9 7.9 0 0 0-2.4-5.74Z"
        fill="currentColor"
      />
    </svg>
  );
}

type Props = {
  phone: string;
  whatsapp?: string | null;
  name?: string | null;
  business?: string | null;
  websiteUrl?: string | null;
  proposedUrl?: string | null;
  compact?: boolean;
  /** Se llama al abrir WhatsApp o llamar (p. ej. para sugerir marcar "Contactado"). */
  onReach?: () => void;
};

/** Acciones rápidas de un contacto: WhatsApp con mensaje sugerido, llamar, copiar y enlaces web. */
export function ContactActions({ phone, whatsapp, name, business, websiteUrl, proposedUrl, compact, onReach }: Props) {
  const toast = useToast();
  const profile = useProfile();
  const { settings } = useWorkspace();
  const waNumber = whatsapp || phone;
  const message = fillTemplate(settings.whatsapp_template, { name: name ? firstName(name) : '', business, employee: firstName(profile.full_name) });
  const site = externalUrl(websiteUrl);
  const proposal = externalUrl(proposedUrl);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatPhone(phone, settings.default_country_code).replace(/\s/g, ''));
      toast.success('Número copiado');
    } catch {
      toast.error('No se pudo copiar el número');
    }
  };

  return (
    <div className={`contact-actions ${compact ? 'is-compact' : ''}`}>
      <LinkButton href={whatsappLink(waNumber, message)} external variant="whatsapp" size="sm" icon={<WhatsAppIcon size={16} />} onClick={onReach}>
        {compact ? undefined : 'WhatsApp'}
      </LinkButton>
      <LinkButton href={telLink(phone)} variant="secondary" size="sm" icon={<Phone size={15} />} title="Llamar" onClick={onReach}>
        {compact ? undefined : 'Llamar'}
      </LinkButton>
      <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={copy} title="Copiar número" aria-label="Copiar número" />
      {site && <LinkButton href={site} external size="sm" variant="ghost" icon={<Globe size={15} />} title="Página web actual del negocio" />}
      {proposal && <LinkButton href={proposal} external size="sm" variant="ghost" icon={<Sparkles size={15} />} title="Página propuesta por WebZipe" />}
    </div>
  );
}
