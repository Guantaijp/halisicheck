/**
 * British English style reference, injected into the rewrite prompt.
 *
 * Kept as a reference the model reads rather than a rules engine that rewrites
 * mechanically: spelling can be table-driven, but register and idiom cannot,
 * and a find-and-replace pass produces text that is correct and still reads
 * translated.
 */
export const BRITISH_ENGLISH_GUIDE = `BRITISH ENGLISH STYLE REFERENCE

Spelling
- -ise / -isation endings: organise, recognise, realise, analyse, prioritise, globalisation. (Oxford -ize exists but is not the default here.)
- -our: colour, behaviour, favour, labour, honour.
- -re: centre, metre, theatre, fibre.
- Doubled l before suffixes: travelled, modelling, cancelled, labelled.
- -ce for nouns, -se for verbs: a licence / to license; practice (n) / practise (v); defence, offence.
- programme (except computer program), cheque, tyre, kerb, storey, grey, plough, draught.

Punctuation and mechanics
- Single quotes for speech are common; double quotes are acceptable. Be consistent.
- Punctuation sits outside the closing quote unless it belongs to the quoted matter.
- No full stops in contracted titles: Mr, Mrs, Dr, St.
- Serial (Oxford) comma only where it removes genuine ambiguity.
- Dates as 12 September 2026. Never 9/12/26.
- Collective nouns often take a plural verb: the committee have agreed; the team are ready.

Vocabulary and idiom
- autumn (not fall), holiday (not vacation), flat (not apartment), lift (not elevator), motorway, queue, timetable, post (not mail), mobile (not cell), CV (not résumé), maths (not math).
- at the weekend, not on the weekend. different from or different to, not different than.
- wrote to him, not wrote him.

Register
- Understatement over emphasis. "This is not ideal" does more work than "This is a catastrophe".
- Hedge with judgement, not reflex: arguably, broadly, on balance, it is fair to say.
- Avoid business-speak: leverage, utilise, going forward, actionable, deep dive, circle back.
- Vary sentence length deliberately. A short sentence after two long ones is the single most useful rhythm tool.`;
