/**
 * Page /templates — accès rapide au gestionnaire de templates de projets.
 *
 * Le composant `TemplateEditorDialog` gère toute l'UI (liste + création + édition).
 * On l'utilise ici en mode "toujours ouvert" ; sa fermeture redirige vers /projets.
 */
import { useNavigate } from 'react-router-dom'
import TemplateEditorDialog from '@/components/projet/TemplateEditorDialog'

export default function Templates() {
  const navigate = useNavigate()
  return (
    <div>
      <TemplateEditorDialog
        open
        onClose={() => navigate('/projets')}
      />
    </div>
  )
}
