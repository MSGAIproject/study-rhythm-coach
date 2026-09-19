import { useEffect, useRef, useState } from 'react'
import { checkWakeQuiz } from './wakeQuiz.js'

export default function WakeUpChallenge({ quiz, onSolved }) {
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const firstInputRef = useRef(null)

  useEffect(() => { firstInputRef.current?.focus() }, [])

  const submit = (event) => {
    event.preventDefault()
    if (!checkWakeQuiz(quiz, answers)) {
      setError('아직 틀린 답이 있어요. 세 문제를 모두 다시 확인해 주세요.')
      return
    }
    onSolved()
  }

  return <div className="wake-overlay" role="alertdialog" aria-modal="true" aria-labelledby="wake-title" aria-describedby="wake-description">
    <section className="wake-dialog">
      <div className="wake-alarm-icon" aria-hidden="true">!</div>
      <span>졸음 의심 자세 10초 지속</span>
      <h2 id="wake-title">잠깐, 정신을 깨워 볼까요?</h2>
      <p id="wake-description">경고음을 끄려면 아래 세 문제를 모두 맞혀 주세요.</p>
      <form onSubmit={submit}>
        {quiz.map((question, index) => <fieldset key={question.id}>
          <legend><b>{index + 1}</b>{question.prompt}</legend>
          {question.choices ? <div className="wake-choices">{question.choices.map((choice) => <label key={choice}><input type="radio" name={question.id} value={choice} checked={answers[question.id] === choice} onChange={(event) => { setAnswers((current) => ({ ...current, [question.id]: event.target.value })); setError('') }} />{choice}</label>)}</div> : <input ref={index === 0 ? firstInputRef : undefined} inputMode="numeric" pattern="[0-9]*" required autoComplete="off" aria-label={`${index + 1}번 답`} value={answers[question.id] || ''} onChange={(event) => { setAnswers((current) => ({ ...current, [question.id]: event.target.value })); setError('') }} />}
        </fieldset>)}
        {error && <p className="wake-error" role="status">{error}</p>}
        <button type="submit">정답 확인하고 경고음 끄기</button>
      </form>
      <small>이 기능은 자세 변화로 졸음을 추정하며 의료적 판단이 아닙니다.</small>
    </section>
  </div>
}
