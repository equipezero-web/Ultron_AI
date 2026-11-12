import {WORLD_GEO_TOPICS} from "./jarvis-world-geodata.js";

// Deterministic global map intent. Research prose and arbitrary URLs cannot
// manufacture a dataset or gain authority to paint world regions.
const intents=[
 ["earthquakes",/\b(?:terremotos?|sismos?|abalos? sismicos?)\b/],
 ["wildfires",/\b(?:queimadas?|incendios? florestais?|focos? de incendio)\b/],
 ["volcanoes",/\b(?:vulcoes?|vulcao|erupcoes? vulcanicas?)\b/],
 ["severeStorms",/\b(?:tempestades? severas?|tempestades? tropicais?|furacoes?|ciclones?|tuf[oõ]es?)\b/],
 ["floods",/\b(?:enchentes?|inundacoes?|alagamentos?|areas? alagadas?)\b/],
 ["landslides",/\b(?:deslizamentos?|escorregamentos? de terra)\b/],
 ["population",/\b(?:populacao|habitantes|pessoas por pais|populacoes)\b/],
 ["gdp",/\b(?:pib|produto interno bruto|economia por pais|riqueza dos paises)\b/],
 ["co2",/\b(?:co2|carbono|emissoes? de gases?|emissao de carbono)\b/]
];
const climates=[
 ["air",/\b(?:qualidade do ar|poluicao do ar|indice de ar|aqi)\b/],
 ["soil",/\b(?:umidade do solo|solo umido|solo seco)\b/],
 ["marine",/\b(?:ondas oceanicas|altura das ondas|ondas do mar|ondulacao do mar)\b/],
 ["river",/\b(?:vazao de rios?|vazao fluvial|descarga fluvial)\b/],
 ["temp",/\b(?:calor|temperaturas?|ondas de calor|temperatura maxima)\b/],
 ["rain",/\b(?:chuva|precipitacao|pluviometria)\b/]
];
export function worldGeoIntent(command){
 const q=String(command||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/\s+/g," ").trim();
 if(q.length>450||q.length<7)return null;
 // Avoid turning ordinary information requests into actions.
 const map=/\b(?:mapa|globo|2d|3d|visualiz\w*|pint\w*|cores?|color\w*|distribuicao geografica|camadas? geografica\w*|regioes do mundo)\b/.test(q);
 const verb=/\b(?:mostre|mostra|mostrar|exiba|exibir|abra|abrir|visualize|visualizar|pinte|pintar|mapeie|mapear|aponte|destaque|destaquem|quero ver|onde estao|onde ficam|onde ficam)\b/.test(q);
 if(!map||!verb||/\b(?:nao|nunca|sem|evite)\s+(?:mostre|exiba|abra|pinte|visualize|mapa)\b/.test(q))return null;
 const region=/\b(?:brasil|brasileiros?|brasileiras?|territorio brasileiro)\b/.test(q)?"brazil":"world";
 const view=/\b(?:3d|globo)\b/.test(q)?"3d":"2d";
 for(const [topic,test] of intents){
  if(test.test(q)&&Object.hasOwn(WORLD_GEO_TOPICS,topic))return {action:"geo.global",args:{topic,region,view}};
 }
 // Global numeric climate layers are geographic model samples. No polygon
 // receives an unsupported, guessed environmental impact severity.
 if(/\b(?:mundo|mundial|global|planeta|brasil|brasileiro|continentes?|regioes?|paises?|mapa)\b/.test(q))
 for(const [layer,test] of climates){
  if(test.test(q))return {action:"geo.spatial",args:{layer,region,view}};
 }
 return null;
}
