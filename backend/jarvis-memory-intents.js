/** Operator-scoped preference requests. Intent recognition never grants tool authority. */
export function interfacePreferenceIntent(message){
  const q=String(message||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/^(?:(?:ei|ola|oi|hey)\s+)?(?:j\.?a\.?r\.?v\.?i\.?s\.?|jarvis|ultron)[,!:;\s]+/i,"")
    .replace(/[?!.,;:]+$/g,"").replace(/\s+/g," ").trim();
  const isPreference=/\bpreferencia de interface\b/.test(q);
  if(isPreference && /^(?:lembre-se de que|lembre se de que|lembre-se que|lembre que|guarde|salve|registre)\b/.test(q))
    return "store";
  if(isPreference && /^(?:qual|quais|e qual|voce lembra|lembra|o que)\b/.test(q))
    return "recall";
  if(/^(?:e qual foi|qual foi|e qual era|qual era) a preferencia que (?:eu )?(?:acabei de )?(?:informar|disser|falar)\b/.test(q))
    return "recall";
  return null;
}
