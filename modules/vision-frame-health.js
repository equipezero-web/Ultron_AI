export function analyzePixelBuffer(data, previous = null) {
  const values = data instanceof Uint8ClampedArray || data instanceof Uint8Array
    ? data
    : new Uint8ClampedArray(data || []);

  if (!values.length || values.length < 4) {
    return {
      ok: false,
      signal: 'NO_FRAME',
      meanLuma: 0,
      variance: 0,
      changeScore: null,
      darkRatio: 1,
      brightRatio: 0,
      sample: new Uint8Array()
    };
  }

  let total = 0;
  let totalSq = 0;
  let dark = 0;
  let bright = 0;
  const sample = new Uint8Array(Math.ceil(values.length / 16));
  let sampleIndex = 0;
  let pixelCount = 0;

  for (let i = 0; i < values.length; i += 4) {
    const r = Number(values[i] || 0);
    const g = Number(values[i + 1] || 0);
    const b = Number(values[i + 2] || 0);
    const luma = Math.round((0.2126 * r) + (0.7152 * g) + (0.0722 * b));
    total += luma;
    totalSq += luma * luma;
    if (luma < 12) dark += 1;
    if (luma > 245) bright += 1;
    if (pixelCount % 4 === 0) sample[sampleIndex++] = luma;
    pixelCount += 1;
  }

  const meanLuma = total / Math.max(1, pixelCount);
  const variance = Math.max(0, (totalSq / Math.max(1, pixelCount)) - (meanLuma * meanLuma));
  const darkRatio = dark / Math.max(1, pixelCount);
  const brightRatio = bright / Math.max(1, pixelCount);

  let changeScore = null;
  if (previous?.length && sample.length) {
    const length = Math.min(previous.length, sample.length);
    let delta = 0;
    for (let i = 0; i < length; i += 1) delta += Math.abs(sample[i] - previous[i]);
    changeScore = delta / Math.max(1, length);
  }

  let signal = 'LIVE';
  if (meanLuma < 7 && variance < 16 && darkRatio > 0.95) signal = 'BLACK';
  else if (meanLuma > 248 && variance < 9 && brightRatio > 0.96) signal = 'BLANK';
  else if (changeScore !== null && changeScore < 0.35) signal = 'STATIC';

  return {
    ok: !['NO_FRAME', 'BLACK', 'BLANK'].includes(signal),
    signal,
    meanLuma: Number(meanLuma.toFixed(2)),
    variance: Number(variance.toFixed(2)),
    changeScore: changeScore === null ? null : Number(changeScore.toFixed(2)),
    darkRatio: Number(darkRatio.toFixed(3)),
    brightRatio: Number(brightRatio.toFixed(3)),
    sample
  };
}

export function summarizeFrameHealth(readings = []) {
  const valid = readings.filter(Boolean);
  if (!valid.length) return { ok: false, signal: 'NO_FRAME', readings: 0 };

  const fatal = valid.find((item) => item.signal === 'BLACK' || item.signal === 'BLANK' || item.signal === 'NO_FRAME');
  if (fatal) {
    return {
      ok: false,
      signal: fatal.signal,
      readings: valid.length,
      meanLuma: fatal.meanLuma,
      variance: fatal.variance,
      changeScore: fatal.changeScore
    };
  }

  const changes = valid
    .map((item) => item.changeScore)
    .filter((value) => Number.isFinite(value));
  const averageChange = changes.length
    ? changes.reduce((sum, value) => sum + value, 0) / changes.length
    : null;

  const staticReadings = valid.filter((item) => item.signal === 'STATIC').length;
  const signal = staticReadings >= Math.max(2, valid.length - 1) ? 'STATIC_VERIFY' : 'LIVE';

  return {
    ok: true,
    signal,
    readings: valid.length,
    meanLuma: Number((valid.reduce((sum, item) => sum + Number(item.meanLuma || 0), 0) / valid.length).toFixed(2)),
    variance: Number((valid.reduce((sum, item) => sum + Number(item.variance || 0), 0) / valid.length).toFixed(2)),
    changeScore: averageChange === null ? null : Number(averageChange.toFixed(2))
  };
}
