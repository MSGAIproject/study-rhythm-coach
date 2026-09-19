export const EXAM_SUBJECTS = ['국어', '수학', '영어', '한국사', '통합사회', '통합과학', '탐구1', '탐구2']

export function scoreGap(current, target, metric) {
  if (current == null || target == null || current === '' || target === '') return null
  const difference = metric === 'grade' ? Number(current) - Number(target) : Number(target) - Number(current)
  return Math.max(0, Math.round(difference * 100) / 100)
}

export function normalizedScores(draft) {
  return Object.fromEntries(Object.entries(draft).map(([subject, score]) => [subject, Object.fromEntries(['grade', 'percentile', 'raw', 'standard', 'elective'].map((key) => [key, key === 'elective' ? score[key] || '' : score[key] === '' || score[key] == null ? null : Number(score[key])]))]).filter(([, score]) => ['grade', 'percentile', 'raw', 'standard'].some((key) => score[key] != null)))
}
