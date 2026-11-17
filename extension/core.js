export function normalizeWord(input) {
  const word = String(input ?? '').trim().replace(/[’‘]/g, "'").replace(/^["'“”([{]+|["'“”.,!?;:)\]}]+$/g, '').toLowerCase();
  if (!word || word.length > 80 || !/^[a-z]+(?:['-][a-z]+)*$/.test(word)) throw new Error('请选中一个英文单词。');
  return word;
}

export function safeUrl(input) {
  try { const u = new URL(input); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}

export function scheduleReview(record, grade, now = Date.now()) {
  const next = {...record, lastReviewedAt: now, lastGrade: grade};
  if (grade === 'forgotten') { next.repetitions = 0; next.intervalDays = 0; next.dueAt = now + 600000; }
  else if (grade === 'unsure') { next.intervalDays = 1; next.dueAt = now + 86400000; }
  else if (grade === 'remembered') {
    next.repetitions = (record.repetitions || 0) + 1;
    next.intervalDays = [1,3,7,14,30,60][Math.min(next.repetitions - 1, 5)];
    next.dueAt = now + next.intervalDays * 86400000;
  } else throw new Error('无效的复习评分。');
  return next;
}

const str = (v, max = 5000) => typeof v === 'string' ? v.slice(0, max) : '';
export function cleanContext(context = {}) {
  return {sentence:str(context.sentence,1000),title:str(context.title,300),url:safeUrl(context.url)};
}

export function cleanLookup(data = {}) {
  return {
    word:normalizeWord(data.word), phonetic:str(data.phonetic,120), audio:safeUrl(data.audio),
    meanings:(Array.isArray(data.meanings) ? data.meanings : []).slice(0,5).map(m => ({
      partOfSpeech:str(m.partOfSpeech,40),
      definitions:(Array.isArray(m.definitions) ? m.definitions : []).slice(0,4).map(d=>({definition:str(d.definition,1500),example:str(d.example,1000)}))
    })),
    translation:str(data.translation,1200), translationKind:str(data.translationKind,60), etymology:str(data.etymology,12000),
    roots:(Array.isArray(data.roots) ? data.roots : []).filter(x=>typeof x==='string').slice(0,12).map(x=>str(x,200)),
    related:(Array.isArray(data.related) ? data.related : []).filter(x=>typeof x==='string').slice(0,12).map(x=>str(x,100)),
    sources:(Array.isArray(data.sources) ? data.sources : []).slice(0,8).map(s=>({name:str(s.name,100),url:safeUrl(s.url),license:str(s.license,120)})),
    warnings:(Array.isArray(data.warnings) ? data.warnings : []).filter(x=>typeof x==='string').slice(0,8).map(x=>str(x,300))
  };
}

export function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.words) || data.words.length > 5000) throw new Error('备份格式无效，或超过 5000 个单词。');
  return data.words.map(r => {
    const bad = () => {throw new Error('备份含有无效词条，未导入任何内容。');};
    if (!r || typeof r.word !== 'string' || !r.lookup || !Array.isArray(r.lookup.meanings) || !r.context || typeof r.context !== 'object') bad();
    for (const k of ['repetitions','intervalDays','dueAt','createdAt']) if (!Number.isSafeInteger(r[k]) || r[k]<0 || r[k]>8640000000000000) bad();
    if (r.lastReviewedAt !== null && (!Number.isSafeInteger(r.lastReviewedAt) || r.lastReviewedAt<0)) bad();
    for (const k of ['note','translation']) if (typeof r[k]!=='string' || r[k].length>12000) bad();
    for (const m of r.lookup.meanings) if (!m || typeof m.partOfSpeech!=='string' || !Array.isArray(m.definitions) || m.definitions.some(d=>!d || typeof d.definition!=='string')) bad();
    for (const k of ['roots','related','warnings']) if (r.lookup[k] !== undefined && (!Array.isArray(r.lookup[k]) || r.lookup[k].some(x=>typeof x!=='string'))) bad();
    if (r.lookup.sources !== undefined && (!Array.isArray(r.lookup.sources) || r.lookup.sources.some(s=>!s || typeof s.name!=='string' || typeof s.url!=='string'))) bad();
    if(r.lastGrade!==undefined && r.lastGrade!==null && !['forgotten','unsure','remembered'].includes(r.lastGrade)) bad();
    const word=normalizeWord(r.word);
    return {word,lookup:cleanLookup({...r.lookup,word}),context:cleanContext(r.context),note:str(r.note,12000),translation:str(r.translation,12000),repetitions:r.repetitions,intervalDays:r.intervalDays,dueAt:r.dueAt,createdAt:r.createdAt,lastReviewedAt:r.lastReviewedAt,lastGrade:r.lastGrade || null};
  });
}
