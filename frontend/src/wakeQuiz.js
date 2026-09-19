const VOCABULARY = [
  { prompt: "'성실하다'와 뜻이 가장 가까운 말은?", choices: ['부지런하다', '성급하다', '느긋하다'], answer: '부지런하다' },
  { prompt: "'명확하다'와 뜻이 가장 가까운 말은?", choices: ['분명하다', '복잡하다', '조용하다'], answer: '분명하다' },
  { prompt: "'감소하다'의 반대말은?", choices: ['증가하다', '유지하다', '정리하다'], answer: '증가하다' },
  { prompt: "'신중하다'와 뜻이 가장 가까운 말은?", choices: ['조심스럽다', '활발하다', '간단하다'], answer: '조심스럽다' },
]

function integer(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min
}

export function createWakeQuiz(random = Math.random) {
  const firstA = integer(random, 4, 18)
  const firstB = integer(random, 3, 15)
  const secondA = integer(random, 3, 9)
  const secondB = integer(random, 2, 9)
  const vocabulary = VOCABULARY[integer(random, 0, VOCABULARY.length - 1)]
  return [
    { id: 'math-add', prompt: `${firstA} + ${firstB} = ?`, choices: null, answer: String(firstA + firstB) },
    { id: 'math-multiply', prompt: `${secondA} × ${secondB} = ?`, choices: null, answer: String(secondA * secondB) },
    { id: 'vocabulary', ...vocabulary },
  ]
}

export function checkWakeQuiz(quiz, answers) {
  return quiz.every((question) => String(answers[question.id] ?? '').trim() === question.answer)
}
