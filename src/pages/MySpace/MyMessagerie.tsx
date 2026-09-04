/**
 * /my-space/messagerie — la messagerie privée de l'employé.
 *
 * À ne pas confondre avec /my-space/messages (« Messages projets »), qui
 * rassemble les discussions attachées aux projets : ici, l'échange est de
 * personne à personne et n'est visible que des deux participants.
 */
import { MessageCircle } from 'lucide-react'
import MessagesPane from '@/components/messages/MessagesPane'

export default function MyMessagerie() {
  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-11rem)] lg:h-[calc(100dvh-8rem)] min-h-[460px]">
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Messages
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Vos échanges privés avec l'équipe. Personne d'autre ne les voit.
        </p>
      </div>

      {/* min-h-0 : sans lui, un enfant flex garde la hauteur de son contenu et
          le fil déborderait de la page au lieu de défiler sur lui-même. */}
      <div className="flex-1 min-h-0">
        <MessagesPane as="member" basePath="/my-space/messagerie" />
      </div>
    </div>
  )
}
