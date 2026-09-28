import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button, LinkButton } from '../../../components/ui/Button';
import { WhatsAppIcon } from '../../../components/domain/ContactActions';
import { useWorkspace } from '../../../components/layout/WorkspaceProvider';
import { formatDateTime, firstName } from '../../../utils/format';
import { normalizePhone, whatsappLink } from '../../../utils/phone';

export type InviteInfo = {
  url: string;
  expiresAt: string;
  purpose: 'activation' | 'reset';
  employee: { full_name: string; username: string; email: string; phone: string | null };
};

/**
 * Muestra el enlace de activación / restablecimiento. El administrador lo
 * comparte por WhatsApp o correo; nunca ve ni define la contraseña.
 */
export function InviteLinkModal({ invite, onClose }: { invite: InviteInfo | null; onClose: () => void }) {
  const { settings } = useWorkspace();
  const [copied, setCopied] = useState(false);
  if (!invite) return null;

  const isReset = invite.purpose === 'reset';
  const message = isReset
    ? `Hola ${firstName(invite.employee.full_name)}, este es tu enlace para crear una nueva contraseña en la plataforma de WebZipe (usuario: ${invite.employee.username}): ${invite.url}`
    : `Hola ${firstName(invite.employee.full_name)}, bienvenido(a) a WebZipe. Activa tu cuenta y crea tu contraseña aquí: ${invite.url}  Tu usuario es: ${invite.employee.username}`;
  const phone = invite.employee.phone ? normalizePhone(invite.employee.phone, settings.default_country_code) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isReset ? 'Enlace para restablecer contraseña' : 'Cuenta creada: envía la invitación'}
      description={`Para ${invite.employee.full_name} (@${invite.employee.username}). Es personal, de un solo uso y vence el ${formatDateTime(invite.expiresAt)}.`}
      footer={
        <Button variant="primary" onClick={onClose}>
          Listo
        </Button>
      }
    >
      <div className="invite-box">
        <code className="invite-url">{invite.url}</code>
        <Button variant={copied ? 'secondary' : 'primary'} icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
          {copied ? 'Copiado' : 'Copiar enlace'}
        </Button>
      </div>
      <div className="invite-share">
        <LinkButton href={phone ? whatsappLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`} external variant="whatsapp" icon={<WhatsAppIcon size={16} />}>
          {phone ? 'Enviar por WhatsApp' : 'Compartir por WhatsApp'}
        </LinkButton>
        <LinkButton
          href={`mailto:${invite.employee.email}?subject=${encodeURIComponent(isReset ? 'Restablece tu contraseña de WebZipe' : 'Activa tu cuenta de WebZipe')}&body=${encodeURIComponent(message)}`}
          variant="secondary"
          icon={<Mail size={16} />}
        >
          Enviar por correo
        </LinkButton>
      </div>
      <p className="text-mute small">
        Con este enlace el empleado crea su propia contraseña. Por seguridad no se vuelve a mostrar: si se pierde, genera uno nuevo desde la ficha del
        empleado (el anterior deja de funcionar).
      </p>
    </Modal>
  );
}
