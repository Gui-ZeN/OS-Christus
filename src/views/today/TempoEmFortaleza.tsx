import React, { useEffect, useState } from 'react';
import { CloudRain, Droplets } from 'lucide-react';
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

  const chuvaImporta = tempo.chovendoAgora || tempo.chanceDeChuva >= CHANCE_RELEVANTE;
  const quandoPico =
    tempo.horasAteOPico === 0 ? 'nesta hora' : `em ${tempo.horasAteOPico}h`;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-serif text-lg text-roman-text-main tabular-nums">
        {Math.round(tempo.temperatura)}°
      </span>

      <span className={`flex items-center gap-1.5 ${chuvaImporta ? 'text-roman-text-main' : 'text-roman-text-sub'}`}>
        <CloudRain size={14} className={chuvaImporta ? 'text-roman-primary' : ''} />
        {tempo.chovendoAgora ? (
          <span>chovendo agora</span>
        ) : (
          <span className="tabular-nums">
            {tempo.chanceDeChuva}% de chuva
            {tempo.chanceDeChuva > 0 && <span className="text-roman-text-sub"> · pico {quandoPico}</span>}
          </span>
        )}
      </span>

      {/* O número só aparece quando a chuva pesa E existe OS de água aberta: fora
          disso seria mais um contador competindo por atenção. */}
      {chuvaImporta && osDeAgua > 0 && (
        <button
          type="button"
          onClick={aoFiltrarAgua}
          className="inline-flex items-center gap-1.5 rounded-sm border border-roman-primary/50 bg-roman-primary/5 px-2 py-1 text-sm font-medium text-roman-text-main transition-colors hover:bg-roman-primary/10"
        >
          <Droplets size={13} className="text-roman-primary" />
          <span className="tabular-nums">{osDeAgua}</span>
          <span className="text-roman-text-sub">de água</span>
        </button>
      )}
    </div>
  );
}
