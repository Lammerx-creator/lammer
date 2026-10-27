// Small, manually curated dictionary. These are linguistic entries, not PDF answer keys.
export const lexicon: string[][] = [
 ['Besprechung','noun','die','Besprechungen','','совещание'],
 ['Frist','noun','die','Fristen','','срок'],
 ['Rückmeldung','noun','die','Rückmeldungen','','обратная связь; ответ'],
 ['Bewerbung','noun','die','Bewerbungen','','заявление о приёме на работу'],
 ['Rechnung','noun','die','Rechnungen','','счёт'],
 ['Unternehmen','noun','das','Unternehmen','','предприятие'],
 ['Arbeitsplatz','noun','der','Arbeitsplätze','','рабочее место'],
 ['Mitarbeiter','noun','der','Mitarbeiter','','сотрудник'],
 ['Ausbildung','noun','die','Ausbildungen','','профессиональное обучение'],
 ['Weiterbildung','noun','die','Weiterbildungen','','повышение квалификации'],
 ['Erfahrung','noun','die','Erfahrungen','','опыт'],
 ['Angebot','noun','das','Angebote','','предложение'],
 ['Vertrag','noun','der','Verträge','','договор'],
 ['Kunde','noun','der','Kunden','','клиент'],
 ['Aufgabe','noun','die','Aufgaben','','задача'],
 ['arbeiten','verb','','','arbeitet · arbeitete · hat gearbeitet','работать'],
 ['erhalten','verb','','','erhält · erhielt · hat erhalten','получать'],
 ['bewerben','verb','','','bewirbt · bewarb · hat beworben','подавать заявление; рекламировать (зависит от контекста)'],
 ['vereinbaren','verb','','','vereinbart · vereinbarte · hat vereinbart','согласовывать; договариваться'],
 ['kündigen','verb','','','kündigt · kündigte · hat gekündigt','увольняться; расторгать договор'],
];
export const known = new Map<string, Omit<import("./model").Word, "id" | "frequency">>();
for (const [lemma,pos,article,plural,verbForms,translation] of lexicon) {
 const value={lemma,pos,article,plural,verbForms,translation,review:1,difficulty:'B2',note:'Редакционный мини-словарь; значение в контексте PDF требует проверки.'};
 // Only explicitly listed forms are merged. Ambiguous forms remain flagged for review.
 for(const form of new Set([lemma,plural].filter(Boolean))) known.set(form.toLocaleLowerCase('de'),value);
}
