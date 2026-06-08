import type { ComponentType } from 'react';
import { ShieldCheck, Sparkles, Compass, Type, Smartphone, Activity } from 'lucide-react';

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
  version: '2026.06',
  title: 'Novidades do sistema',
  subtitle: 'Atualização de junho • principais melhorias',
  items: [
    {
      Icon: ShieldCheck,
      title: 'Mais segurança',
      body: 'Reforçamos as proteções de acesso, do formulário público e dos e-mails do sistema.',
    },
    {
      Icon: Sparkles,
      title: 'Caixa de Entrada mais limpa',
      body: 'O painel da OS foi simplificado. Para mudar de etapa, use “Alterar etapa” — e o botão mostra a ação (“Salvar e mover para…”).',
    },
    {
      Icon: Compass,
      title: 'Faixa “Próximo passo”',
      body: 'Cada OS indica o que fazer naquela etapa — ou o que está aguardando (diretoria/solicitante).',
    },
    {
      Icon: Type,
      title: 'Acentuação corrigida',
      body: 'Textos e e-mails sem mais caracteres quebrados em palavras com acento.',
    },
    {
      Icon: Smartphone,
      title: 'Melhor no celular e no notebook',
      body: 'As telas se ajustam melhor em telas menores, incluindo a Caixa de Entrada.',
    },
    {
      Icon: Activity,
      title: 'Mais estável',
      body: 'Evitamos perda de histórico em edições simultâneas e telas que podiam travar.',
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
