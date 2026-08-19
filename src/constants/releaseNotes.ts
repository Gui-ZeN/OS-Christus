import type { ComponentType } from 'react';
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Layers,
  MailCheck,
  PhoneCall,
  Sparkles,
} from 'lucide-react';

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
  /**
   * Aviso em destaque, acima da lista. Existe para esta leva: não é "mais uma
   * atualização", é uma reforma que muda o jeito de usar — e avisar isso em letra
   * miúda, no meio de seis itens, seria o mesmo que não avisar.
   */
  highlight?: { title: string; body: string };
  items: ReleaseNoteItem[];
}

/**
 * Notas da versão atual, exibidas uma vez para Admin/Gestor.
 * Para anunciar uma nova leva: troque `version` e atualize `items`.
 */
export const CURRENT_RELEASE: ReleaseNote = {
  version: '2026.08.3',
  title: 'O Serv3 está mudando',
  subtitle: 'A visita marcada virou o centro do sistema — e as 13 etapas viraram 6',
  highlight: {
    title: 'Leia antes de continuar',
    body:
      'Duas mudanças grandes. As ETAPAS caíram de treze para seis, com os nomes que a ' +
      'operação já usa. E o Serv3 passou a FALAR COM AS SEDES por e-mail: manda a agenda ' +
      'do dia, pergunta se o fornecedor apareceu e avisa quando ele falta. Ele registra e ' +
      'pergunta — quem cobra fornecedor continua sendo você, do jeito que já faz. Se algo ' +
      'parecer errado ou atrapalhar, avise: é para isso que está indo aos poucos.',
  },
  items: [
    {
      Icon: Layers,
      title: 'Treze etapas viraram seis',
      body:
        'Nova OS · Em análise · Em orçamento · Contratação · Em execução · Concluída (mais ' +
        'Cancelada). Sumiu a escolha entre dois nomes que a operação lia como um — "parecer ' +
        'técnico" e "aprovação da solução" viraram "Em análise". Nada foi perdido: o degrau ' +
        'fino continua no histórico e na linha do tempo da OS. E "Encerrada" agora se chama ' +
        '"Concluída".',
    },
    {
      Icon: CalendarClock,
      title: 'A tela Hoje virou uma agenda',
      body:
        'Ela abre com o que está marcado para hoje, hora a hora — quem prometeu vir, em que ' +
        'sede, para quais OS. Antes ela abria com dez cartões de "definir a próxima ação", ' +
        'que é backlog, não agenda. O passivo continua lá, numa linha só, e se resolve em ' +
        'lote na Gestão.',
    },
    {
      Icon: MailCheck,
      title: 'A sede confirma a visita em um clique',
      body:
        'Marcou visita, a sede recebe às 07h a agenda do dia dela. Passados 30 minutos do ' +
        'horário sem notícia, o sistema pergunta — e o e-mail traz os botões: chegou, não ' +
        'apareceu, resolvemos por aqui. Um clique responde e a aba fecha sozinha. Ninguém ' +
        'precisa entrar no sistema para responder.',
    },
    {
      Icon: PhoneCall,
      title: 'O botão Cobrar',
      body:
        'Sede disse que o fornecedor não veio? O botão abre a conversa no WhatsApp com a ' +
        'mensagem já escrita — você manda. Depois registra como acabou: respondeu, não ' +
        'respondeu, marcou nova data. É esse registro, e só ele, que vira número no painel.',
    },
    {
      Icon: BarChart3,
      title: 'Indicadores: quanto custa correr atrás',
      body:
        'Um quadro novo mostra, das visitas do período, quantas deram trabalho de cobrança e ' +
        'como acabou — sempre com a amostra do lado ("3 de 6"), porque porcentagem sozinha ' +
        'esconde o tamanho. Ele conta só o que passou pelo botão: ligação feita do celular ' +
        'não entra, e o número é piso, não total.',
    },
    {
      Icon: ClipboardCheck,
      title: 'A revisão de segunda-feira',
      body:
        'Uma vez por semana chega uma lista das OS paradas há mais de 30 dias, com três ' +
        'respostas por linha: encerrar, ainda pendente, ver depois. Nada é encerrado sem ' +
        'você dizer, e o que você encerrar ali pode ser desfeito.',
    },
    {
      Icon: Sparkles,
      title: 'Os e-mails ficaram limpos',
      body:
        'Todos foram refeitos: um quadro só, sem caixas dentro de caixas, com o que importa ' +
        'em cima e o botão logo abaixo. Dá para ler no celular sem apertar os olhos, e o que ' +
        'você vê nas Configurações é o mesmo e-mail que a pessoa recebe.',
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
