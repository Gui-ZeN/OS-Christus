/**
 * TEMPO EM FORTALEZA — temperatura agora e chance de chuva nas próximas horas.
 *
 * Por que Open-Meteo e não o METAR que já existe: o METAR (`api/_lib/metar.js`)
 * entrega chuva OBSERVADA — está chovendo no aeroporto neste instante. É o que o
 * aviso por e-mail precisa, porque o gatilho dele é "acabou de chover, vá conferir
 * as goteiras". Aqui a pergunta é outra: *vai* chover no resto do dia, para quem
 * está montando a agenda decidir se agenda a visita no telhado hoje.
 *
 * Open-Meteo é gratuito, sem chave e responde com CORS liberado — então roda no
 * NAVEGADOR e não gasta nenhuma das 12 funções serverless do plano Hobby, que já
 * estão todas em uso.
 *
 * ⚠️ ELE NÃO DIZ SE ESTÁ CHOVENDO AGORA, e já disse. O campo existia e alimentava um
 * "Chovendo agora" na tela — afirmação de OBSERVAÇÃO tirada de um MODELO, em grade de
 * ~11 km, que não resolve pancada em Fortaleza. Medido nos dois sentidos em 19/08: às
 * 6h30 o modelo marcava 0,0 mm enquanto chovia na Aldeota; às 14h15 marcava 0,1 mm com
 * o METAR do aeroporto e os oito pluviômetros vivos do CEMADEN todos secos.
 *
 * Quem responde "está chovendo" são as fontes observadas, e elas já existem no
 * servidor (`api/_lib/metar.js` e `api/_lib/cemaden.js`) alimentando o aviso por
 * e-mail. Duas respostas para a mesma pergunta, uma delas errada, é pior que uma só.
 *
 * Falhar aqui não é evento: o bloco some da tela. Clima é contexto, não fila de
 * trabalho — uma tarja de erro sobre a agenda custaria mais do que a informação vale.
 */

/** Fortaleza (Praia de Iracema). Uma cidade só: todas as sedes ficam nela. */
const FORTALEZA = { lat: -3.7319, lon: -38.5267 };
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export interface TempoAgora {
  temperatura: number;
  /** Maior chance de chuva nas próximas horas, em %. */
  chanceDeChuva: number;
  /** Em quantas horas está o pico — 0 = nesta hora. */
  horasAteOPico: number;
}

export async function fetchTempoAgora(signal?: AbortSignal): Promise<TempoAgora | null> {
  const url =
    `${ENDPOINT}?latitude=${FORTALEZA.lat}&longitude=${FORTALEZA.lon}` +
    '&current=temperature_2m' +
    '&hourly=precipitation_probability' +
    '&forecast_hours=8&timezone=America%2FFortaleza';

  try {
    const resposta = await fetch(url, { signal });
    if (!resposta.ok) return null;
    const dados = await resposta.json();

    const temperatura = Number(dados?.current?.temperature_2m);
    const probabilidades: number[] = Array.isArray(dados?.hourly?.precipitation_probability)
      ? dados.hourly.precipitation_probability.map(Number).filter((n: number) => Number.isFinite(n))
      : [];
    if (!Number.isFinite(temperatura) || probabilidades.length === 0) return null;

    // O PICO das próximas horas, não a hora atual: quem monta a agenda decide pelo
    // pior momento do dia, não pelo céu de agora.
    const chanceDeChuva = Math.max(...probabilidades);
    return {
      temperatura,
      chanceDeChuva,
      horasAteOPico: probabilidades.indexOf(chanceDeChuva),
    };
  } catch {
    return null;
  }
}
