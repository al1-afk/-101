/**
 * /:tenantSlug/messages — la messagerie privée vue depuis l'espace d'administration.
 *
 * La page se fige à la hauteur utile de l'écran et confie le défilement au volet :
 * sans cette contrainte, la liste des correspondants remontait hors de l'écran dès
 * qu'une conversation dépassait quelques messages, et il fallait remonter toute la
 * page pour changer d'interlocuteur.
 */
import { useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import MessagesPane from '@/components/messages/MessagesPane'

export default function Messages() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  /* Le volet réécrit ?c= et ?u= dans l'URL : il lui faut le chemin complet de
     cette page, celui-là même que les notifications ouvrent. */
  const basePath = tenantSlug ? `/${tenantSlug}/messages` : '/messages'

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-12rem)] md:h-[calc(100dvh-9.5rem)] min-h-[480px]">
      <div className="flex-shrink-0">
        <h1 className="page-title flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-electric-500" />
          Messages
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Discussions privées avec les personnes de l'espace — administration et employés.
        </p>
      </div>

      {/* min-h-0 : sans lui, un enfant flex refuse de rétrécir sous sa hauteur
          de contenu et le fil déborderait au lieu de défiler. */}
      <div className="flex-1 min-h-0">
        <MessagesPane as="admin" basePath={basePath} />
      </div>
    </div>
  )
}
