import { describe, expect, it } from 'vitest';
import {
  aiChallengeDraftSchema,
  findUnsupportedNumbers,
  offlineChallengeDraft,
  redactPersonalData,
  reviewDraftAgainstFinal,
  suggestProblemTag,
} from './aiDraft';

const draft = {
  title: 'Plot-level soil moisture monitoring in Renapur',
  problemStatement: 'Farmers in 5 villages irrigate on fixed schedules. Advisories reach them 14 days late, and 40% of water is wasted.',
  problemTag: 'SOIL_HEALTH' as const,
  fieldSite: 'Renapur taluka — 5 villages',
  metricName: 'Water used per hectare',
  metricUnit: 'm³/ha',
};

describe('aiChallengeDraftSchema', () => {
  it('rejects threshold fields smuggled into the model output', () => {
    const r = aiChallengeDraftSchema.safeParse({ ...draft, baselineValue: 4200 });
    expect(r.success).toBe(false);
  });

  it('rejects a problem tag outside the fixed taxonomy', () => {
    expect(aiChallengeDraftSchema.safeParse({ ...draft, problemTag: 'SOIL_STUFF' }).success).toBe(false);
  });
});

describe('redactPersonalData', () => {
  it('strips phone, Aadhaar and email before text leaves the server', () => {
    const r = redactPersonalData('Call Ganesh on 9876543210 or +91 9123456780, Aadhaar 1234 5678 9012, mail g@x.in');
    expect(r.text).toBe('Call Ganesh on [phone] or [phone], Aadhaar [aadhaar], mail [email]');
    expect(r.redactions).toEqual({ PHONE: 2, AADHAAR: 1, EMAIL: 1 });
  });

  it('leaves ordinary numbers alone', () => {
    expect(redactPersonalData('120 plots in 5 villages, 16 weeks').redactions).toEqual({});
  });
});

describe('findUnsupportedNumbers', () => {
  it('flags numbers the officer never wrote', () => {
    const notes = 'Renapur taluka, 5 villages. Advisories come 14 days late.';
    expect(findUnsupportedNumbers(notes, draft)).toEqual(['40']);
  });

  it('treats 1,20,000 and 120000 as the same number', () => {
    expect(findUnsupportedNumbers('budget 1,20,000', { ...draft, problemStatement: 'Up to 120000 farmers ' + 'x'.repeat(40), title: 'Soil moisture', fieldSite: '', metricName: 'Water', metricUnit: 'm³/ha' })).toEqual([]);
  });
});

describe('reviewDraftAgainstFinal', () => {
  it('marks each field accepted or changed, ignoring whitespace', () => {
    const review = reviewDraftAgainstFinal(draft, { ...draft, title: `  ${draft.title} `, metricUnit: 'kL/ha' });
    expect(review.title).toBe('ACCEPTED');
    expect(review.metricUnit).toBe('CHANGED');
    expect(review.problemTag).toBe('ACCEPTED');
  });
});

describe('offline fallback', () => {
  it('picks a tag from keywords and never produces threshold values', () => {
    expect(suggestProblemTag('Borewell water table readings are taken by hand once a year')).toBe('GROUNDWATER_MONITORING');
    const d = offlineChallengeDraft('PHC medicine stock runs out and nobody knows until patients are turned away. Inventory is on paper.');
    expect(d.problemTag).toBe('PHC_INVENTORY');
    expect(Object.keys(d)).not.toContain('baselineValue');
    expect(d.clarifyingQuestions.length).toBeGreaterThan(0);
  });

  it('returns no tag and no metric when nothing in the taxonomy fits, instead of a default', () => {
    const d = offlineChallengeDraft('in dharavi slum area there is lots of a problem of dogs because they are attacking the children');
    expect(d.problemTag).toBeNull();
    expect(d.metricName).toBe('');
    expect(d.title.startsWith('In dharavi')).toBe(true);
    expect(d.clarifyingQuestions[0]).toMatch(/None of the fixed problem types/);
  });
});
