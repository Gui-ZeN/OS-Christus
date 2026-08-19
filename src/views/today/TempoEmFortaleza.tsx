import React, { useEffect, useState } from 'react';
import { ArrowRight, CloudRain, Droplets } from 'lucide-react';
import { fetchTempoAgora, type TempoAgora } from '../../services/weatherApi';

/**
 * O TEMPO, MAS LIGADO AO TRABALHO.
 *
 * Temperatura sozinha é enfeite — e enfeite é exatamente o que saiu do Início hoje,
 * onde 15 de 19 números não levavam a lugar nenhum. O que justifica o clima nesta
 * tela é a ponte medida: **26 das 178 OS (15%) são problema de água**, e o aviso de
 * chuva por e-mail já existe no Serv3 justamente porque chuva vira goteira.
 *
 * Então: quando a chance de chuva é relevante, o bloco deixa de ser termômetro e
 * vira porta — mostra quantas OS de água estão abertas e abre a lista delas.
 *
 * Se a fonte falhar, o bloco SOME. Clima é contexto; uma tarja de erro sobre a
 * agenda custaria mais do que a informação vale.
 */

/** Acima disto o dia deixa de ser "provavelmente seco" e vira decisão de agenda. */
const CHANCE_RELEVANTE = 40;

interface Props {
  /** Quantas OS de água estão abertas no recorte atual. */
  osDeAgua: number;
  aoFiltrarAgua: () => void;
}

export function TempoEmFortaleza({ osDeAgua, aoFiltrarAgua }: Props) {
  const [tempo, setTempo] = useState<TempoAgora | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    fetchTempoAgora(controle.signal).then(setTempo);
    return () => controle.abort();
  }, []);

  if (!tempo) return null;

  const chuvaImporta = tempo.chanceDeChuva >= CHANCE_RELEVANTE;
  const quandoPico =
    tempo.horasAteOPico === 0 ? 'nesta hora' : `em ${tempo.horasAteOPico}h`;

  /**
   * DIA SECO fala baixo; CHUVA A CAMINHO fala alto.
   *
   * A versão anterior tratava os dois quase igual — só trocava a cor do texto — e o
   * dono pediu mais destaque. O destaque não podia ser permanente: bloco de clima
   * gritando num dia seco é o enfeite que saiu do Início hoje, onde 15 de 19 números
   * não levavam a lugar nenhum.
   *
   * Então a diferença entre os dois estados é que ficou grande: no seco, uma linha
   * discreta; na chuva, um bloco com fundo, contorno e o número de OS de água ao
   * lado — porque aí ele deixou de ser informação e virou trabalho.
   */
  if (!chuvaImporta) {
    return (
      <div className="flex items-center gap-2.5 text-roman-text-sub">
        <span className="font-serif text-xl tabular-nums text-roman-text-main">
          {Math.round(tempo.temperatura)}°
        </span>
        <span className="flex items-center gap-1.5 text-sm tabular-nums">
          <CloudRain size={14} />
          {tempo.chanceDeChuva}% de chuva
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-roman-primary/50 bg-roman-primary/10 px-3.5 py-2">
      <CloudRain size={20} className="shrink-0 text-roman-primary" />

      <div className="leading-tight">
        {/* PREVISÃO, e nunca "chovendo agora".
         *
         * O bloco já afirmou observação — e a fonte é um modelo de grade larga, que
         * errou nos dois sentidos no mesmo dia. Quem sabe se está chovendo é o
         * pluviômetro do bairro e o aeroporto, que alimentam o aviso por e-mail.
         * Aqui a pergunta é outra: vale marcar a visita no telhado hoje?
         */}
        <div className="font-serif text-lg text-roman-text-main">
          <span className="tabular-nums">{tempo.chanceDeChuva}%</span> de chuva
        </div>
        <div className="text-xs text-roman-text-sub tabular-nums">
          {Math.round(tempo.temperatura)}° · pico {quandoPico}
        </div>
      </div>

      {/* O número só aparece quando existe OS de água aberta — senão o bloco
          prometeria uma lista vazia, que é o defeito do botão "Abrir em Financeiro"
          removido em 12/08. */}
      {osDeAgua > 0 && (
        <button
          type="button"
          onClick={aoFiltrarAgua}
          className="group ml-1 inline-flex items-center gap-2 rounded-sm border border-roman-primary bg-roman-surface px-3 py-2 text-left transition-colors hover:bg-roman-primary/10"
        >
          <Droplets size={16} className="shrink-0 text-roman-primary" />
          <span className="leading-tight">
            <span className="block font-serif text-base tabular-nums text-roman-text-main">{osDeAgua}</span>
            <span className="block text-[11px] uppercase tracking-wider text-roman-text-sub">de água</span>
          </span>
          <ArrowRight size={14} className="shrink-0 text-roman-primary transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
