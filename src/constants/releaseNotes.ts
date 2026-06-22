import type { ComponentType } from 'react';
import { Mail, Images, ImagePlus, AtSign, Zap, BellRing } from 'lucide-react';

export interface ReleaseNoteItem {
  Icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}

export interface ReleaseNote {
  /** Bump a cada nova leva de novidades — controla quem já viu (uma vez por versão). */
  version: string;
  title: string;
  subtitle: string;
  items: ReleaseNoteItem[];
}

/**
 * Notas da versão atual, exibidas uma vez para Admin/Gestor.
 * Para anunciar uma nova leva: troque `version` e atualize `items`.
 */
export const CURRENT_RELEASE: ReleaseNote = {
  version: '2026.06.2',
  title: 'Novidades do sistema',
  subtitle: 'Atualização de junho • correções e novidades',
  items: [
    {
      Icon: Mail,
      title: 'E-mails na mesma conversa',
      body: 'As respostas por e-mail agora continuam na mesma conversa (thread), em vez de abrir um e-mail novo a cada resposta.',
    },
    {
      Icon: Images,
      title: 'Várias fotos — e elas chegam na Diretoria',
      body: 'Dá para anexar mais de uma foto por atendimento, uma a uma. E as fotos da OS passam a acompanhar os e-mails enviados à Diretoria.',
    },
    {
      Icon: ImagePlus,
      title: 'Inserir foto na mensagem',
      body: 'Novo botão para inserir foto direto no texto da resposta: a imagem vai anexada e com um link clicável no corpo.',
    },
    {
      Icon: AtSign,
      title: 'Marcar pessoas com @',
      body: 'Digite @ na resposta para marcar alguém: a pessoa é incluída e recebe o e-mail, e o nome sai destacado — como no Gmail.',
    },
    {
      Icon: Zap,
      title: 'Sem travar ao responder',
      body: 'Corrigimos a lentidão que acontecia ao registrar respostas em uma Ordem de Serviço.',
    },
    {
      Icon: BellRing,
      title: 'Aviso quando o e-mail não sai',
      body: 'Se a resposta não puder ser enviada por e-mail (ex.: OS sem e-mail do solicitante), o sistema agora avisa em vez de falhar em silêncio.',
    },
  ],
};

const STORAGE_PREFIX = 'os-christus-release-seen:';

export function hasSeenRelease(version: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${version}`) === '1';
  } catch {
    return false;
  }
}

export function markReleaseSeen(version: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${version}`, '1');
  } catch {
    /* ignore */
  }
}
