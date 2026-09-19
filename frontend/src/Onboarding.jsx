import { useMemo, useState } from 'react'
import { apiFetch } from './api.js'

const SUBJECTS = ['국어', '수학', '영어', '한국사', '탐구', '기타']
const LEARNING_PREFERENCES = [
  ['그림·도표로 정리', '개념을 표, 흐름도, 마인드맵으로 정리하면 이해가 잘돼요.'],
  ['직접 문제 풀기', '설명만 듣기보다 문제를 풀고 피드백을 받을 때 잘 배워요.'],
  ['말로 설명하기', '배운 내용을 내 말로 설명하거나 질문에 답하면 기억이 잘나요.'],
  ['읽고 요약하기', '글을 읽고 핵심 문장이나 요약을 남기는 방식이 편해요.'],
  ['짧게 자주 반복', '긴 학습보다 짧은 복습을 여러 번 하는 편이 잘 맞아요.'],
  ['실전처럼 연습', '시간을 재고 시험과 비슷한 조건에서 연습할 때 집중이 잘돼요.'],
]

const initialAnswers = {
  goal_type: '', goal_description: '', target_date: '', current_level: '',
  learning_preferences: [],
  managed_subjects: [], difficult_subjects: [], school_end_time: '16:30',
  fixed_schedule_notes: '', sleep_time: '00:00', wake_time: '07:00',
  weekday_study_start: '19:00', weekday_study_end: '23:00',
  weekend_availability: '', focus_minutes: 50, break_minutes: 10, plan_intensity: 85,
}

const steps = [
  { key: 'goal_type', question: '지금 가장 먼저 이루고 싶은 목표는 무엇인가요?', hint: '목표에 따라 계획의 기간과 우선순위가 달라져요.' },
  { key: 'goal_description', question: '목표를 조금 더 구체적으로 표현해 볼까요?', hint: '예: 수능 수학 2등급, 10월 모의고사 영어 1등급' },
  { key: 'target_date', question: '이 목표를 언제까지 이루고 싶나요?', hint: '날짜가 아직 없다면 건너뛰어도 괜찮아요.' },
  { key: 'current_level', question: '현재 목표에 얼마나 가까이 와 있다고 생각하나요?', hint: '성적을 모르거나 입력하고 싶지 않다면 체감 수준으로 답해도 돼요.' },
  { key: 'learning_preferences', question: '어떤 방식으로 공부할 때 가장 잘 이해되나요?', hint: '잘 맞는 방식을 여러 개 골라도 돼요. 고정된 유형이 아니라 계획을 조정하는 참고 정보로 사용해요.' },
  { key: 'managed_subjects', question: '이번 계획에서 함께 관리할 과목을 골라주세요.', hint: '여러 과목을 선택할 수 있어요.' },
  { key: 'difficult_subjects', question: '선택한 과목 중 더 많은 도움이 필요한 과목은 무엇인가요?', hint: '없다면 “취약 과목 없음”을 선택하세요.' },
  { key: 'fixed_time', question: '학교와 학원 등 고정 일정을 알려주세요.', hint: '자동 계획이 겹치지 않도록 사용하는 정보예요.' },
  { key: 'daily_time', question: '평소 생활시간과 공부 가능한 시간을 확인할게요.', hint: '수면시간은 줄이지 않고 계획을 만들어요.' },
  { key: 'weekend_availability', question: '주말에는 언제 공부하기 편한가요?', hint: '평일보다 수능 시간 흐름을 적극적으로 적용할 수 있어요.' },
  { key: 'focus', question: '한 번에 어느 정도 집중하는 것이 편한가요?', hint: '아직 잘 모르겠다면 추천 설정을 선택하세요.' },
  { key: 'plan_intensity', question: '계획을 어느 정도 여유 있게 만들까요?', hint: '처음에는 가능한 시간의 85%를 사용하는 것을 추천해요.' },
  { key: 'summary', question: '좋아요. 제가 이해한 내용을 마지막으로 확인해 주세요.', hint: '저장 후에도 언제든 기본 설정을 바꿀 수 있어요.' },
]

const choiceSets = {
  goal_type: ['수능 준비', '모의고사 준비', '내신 시험 준비', '특정 과목 향상', '공부 습관 만들기'],
  current_level: ['기본 개념부터 필요해요', '개념 적용이 어려워요', '어려운 문제가 힘들어요', '실수와 시간 관리가 문제예요', '현재 수준을 잘 모르겠어요'],
  weekend_availability: ['오전', '오후', '저녁', '종일 가능', '주말에는 쉬고 싶어요'],
}

function toggle(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function answerLabel(step, answers) {
  if (step.key === 'fixed_time') return `학교 ${answers.school_end_time || '미입력'} 종료 · ${answers.fixed_schedule_notes || '추가 고정 일정 없음'}`
  if (step.key === 'daily_time') return `수면 ${answers.sleep_time}~${answers.wake_time} · 공부 ${answers.weekday_study_start}~${answers.weekday_study_end}`
  if (step.key === 'focus') return `${answers.focus_minutes}분 집중 + ${answers.break_minutes}분 휴식`
  if (step.key === 'plan_intensity') return `${answers.plan_intensity === 70 ? '여유 있게' : answers.plan_intensity === 95 ? '집중적으로' : '균형 있게'} (${answers.plan_intensity}%)`
  const value = answers[step.key]
  return Array.isArray(value) ? (value.length ? value.join(', ') : '없음') : value
}

function profileAnswers(profile) {
  if (!profile) return initialAnswers
  const timeValue = (value, fallback) => String(value || fallback).slice(0, 5)
  return {
    ...initialAnswers,
    ...profile,
    target_date: profile.target_date || '',
    school_end_time: timeValue(profile.school_end_time, initialAnswers.school_end_time),
    sleep_time: timeValue(profile.sleep_time, initialAnswers.sleep_time),
    wake_time: timeValue(profile.wake_time, initialAnswers.wake_time),
    weekday_study_start: timeValue(profile.weekday_study_start, initialAnswers.weekday_study_start),
    weekday_study_end: timeValue(profile.weekday_study_end, initialAnswers.weekday_study_end),
    learning_preferences: profile.learning_preferences || [],
  }
}

export default function Onboarding({ initialProfile, onComplete, onClose }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState(() => profileAnswers(initialProfile))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const step = steps[stepIndex]
  const history = useMemo(() => steps.slice(0, stepIndex).filter((item) => item.key !== 'summary'), [stepIndex])

  const patch = (values) => setAnswers((current) => ({ ...current, ...values }))
  const toggleManagedSubject = (subject) => setAnswers((current) => {
    const managedSubjects = toggle(current.managed_subjects, subject)
    return {
      ...current,
      managed_subjects: managedSubjects,
      difficult_subjects: current.difficult_subjects.filter((item) => managedSubjects.includes(item)),
    }
  })
  const isValid = () => {
    if (step.key === 'goal_type') return Boolean(answers.goal_type)
    if (step.key === 'goal_description') return Boolean(answers.goal_description.trim())
    if (step.key === 'current_level') return Boolean(answers.current_level)
    if (step.key === 'learning_preferences') return answers.learning_preferences.length > 0
    if (step.key === 'managed_subjects') return answers.managed_subjects.length > 0
    if (step.key === 'weekend_availability') return Boolean(answers.weekend_availability)
    return true
  }
  const next = () => {
    if (!isValid()) return setError('답변을 선택하거나 입력해 주세요.')
    setError('')
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    const payload = { ...answers, target_date: answers.target_date || null }
    try {
      const response = await apiFetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || '기본 설정을 저장하지 못했습니다.')
      onComplete(result)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return <main className="onboarding-shell">
    <header className="onboarding-header"><div className="brand"><span>오</span><div><strong>오름</strong><small>나에게 맞는 첫 계획 만들기</small></div></div><div className="onboarding-header-actions"><span>{stepIndex + 1} / {steps.length}</span><button type="button" className="onboarding-close" onClick={onClose} aria-label="대화형 질문 닫기">닫기 <span aria-hidden="true">×</span></button></div></header>
    <div className="onboarding-progress"><i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
    <div className="conversation">
      {history.slice(-3).map((item) => <div className="history-pair" key={item.key}>
        <p className="coach-bubble">{item.question}</p><p className="answer-bubble">{answerLabel(item, answers)}</p>
      </div>)}
      <section className="question-card">
        <span className="coach-name">리듬 코치</span><h1>{step.question}</h1><p>{step.hint}</p>
        <div className="answer-area">
          {choiceSets[step.key]?.map((choice) => <button type="button" className={`choice ${answers[step.key] === choice ? 'selected' : ''}`} onClick={() => patch({ [step.key]: choice })} key={choice}>{choice}</button>)}
          {step.key === 'goal_description' && <textarea rows="3" value={answers.goal_description} onChange={(event) => patch({ goal_description: event.target.value })} placeholder="예: 수능에서 수학 2등급을 받고 싶어요" autoFocus />}
          {step.key === 'target_date' && <input type="date" value={answers.target_date} onChange={(event) => patch({ target_date: event.target.value })} />}
          {step.key === 'learning_preferences' && <div className="preference-choices">{LEARNING_PREFERENCES.map(([preference, description]) => <button type="button" className={`choice ${answers.learning_preferences.includes(preference) ? 'selected' : ''}`} onClick={() => patch({ learning_preferences: toggle(answers.learning_preferences, preference) })} key={preference}><strong>{preference}</strong><span>{description}</span></button>)}</div>}
          {step.key === 'managed_subjects' && <div className="subject-choices">{SUBJECTS.map((subject) => <button type="button" className={`choice ${answers.managed_subjects.includes(subject) ? 'selected' : ''}`} onClick={() => toggleManagedSubject(subject)} key={subject}>{subject}</button>)}</div>}
          {step.key === 'difficult_subjects' && <><div className="subject-choices">{answers.managed_subjects.map((subject) => <button type="button" className={`choice ${answers.difficult_subjects.includes(subject) ? 'selected' : ''}`} onClick={() => patch({ difficult_subjects: toggle(answers.difficult_subjects, subject) })} key={subject}>{subject}</button>)}</div><button type="button" className={`choice ${!answers.difficult_subjects.length ? 'selected' : ''}`} onClick={() => patch({ difficult_subjects: [] })}>취약 과목 없음</button></>}
          {step.key === 'fixed_time' && <div className="time-form"><label>학교 종료 시간<input type="time" value={answers.school_end_time} onChange={(event) => patch({ school_end_time: event.target.value })} /></label><label>학원·과외 등 고정 일정<textarea rows="3" value={answers.fixed_schedule_notes} onChange={(event) => patch({ fixed_schedule_notes: event.target.value })} placeholder="예: 화·목 19:00~21:00 수학 학원" /></label></div>}
          {step.key === 'daily_time' && <div className="time-grid"><label>취침<input type="time" value={answers.sleep_time} onChange={(event) => patch({ sleep_time: event.target.value })} /></label><label>기상<input type="time" value={answers.wake_time} onChange={(event) => patch({ wake_time: event.target.value })} /></label><label>평일 공부 시작<input type="time" value={answers.weekday_study_start} onChange={(event) => patch({ weekday_study_start: event.target.value })} /></label><label>평일 공부 종료<input type="time" value={answers.weekday_study_end} onChange={(event) => patch({ weekday_study_end: event.target.value })} /></label></div>}
          {step.key === 'focus' && [[25,5],[40,10],[50,10],[80,15]].map(([focus, rest]) => <button type="button" className={`choice ${answers.focus_minutes === focus ? 'selected' : ''}`} onClick={() => patch({ focus_minutes: focus, break_minutes: rest })} key={focus}>{focus}분 집중 + {rest}분 휴식{focus === 50 ? ' · 추천' : ''}</button>)}
          {step.key === 'plan_intensity' && [[70,'여유 있게'],[85,'균형 있게 · 추천'],[95,'집중적으로']].map(([value,label]) => <button type="button" className={`choice ${answers.plan_intensity === value ? 'selected' : ''}`} onClick={() => patch({ plan_intensity: value })} key={value}><strong>{label}</strong><span>공부 가능 시간의 {value}% 사용</span></button>)}
          {step.key === 'summary' && <div className="answer-summary">
            <div><span>목표</span><strong>{answers.goal_description}</strong><small>{answers.goal_type} · {answers.target_date || '목표일 미정'}</small></div>
            <div><span>현재 상태</span><strong>{answers.current_level}</strong><small>관리 과목: {answers.managed_subjects.join(', ')}</small></div>
            <div><span>학습 선호</span><strong>{answers.learning_preferences.join(', ')}</strong><small>효과적인 복습법과 함께 계획에 반영</small></div>
            <div><span>평일 리듬</span><strong>{answers.weekday_study_start}~{answers.weekday_study_end}</strong><small>수면 {answers.sleep_time}~{answers.wake_time}</small></div>
            <div><span>집중 방식</span><strong>{answers.focus_minutes}분 + 휴식 {answers.break_minutes}분</strong><small>계획 강도 {answers.plan_intensity}%</small></div>
          </div>}
        </div>
        {error && <p className="question-error">{error}</p>}
        <div className="question-actions"><button type="button" className="back" disabled={!stepIndex} onClick={() => { setError(''); setStepIndex((current) => current - 1) }}>이전</button>{step.key === 'summary' ? <button type="button" className="next" disabled={saving} onClick={save}>{saving ? '저장 중…' : '이 내용으로 시작하기'}</button> : <button type="button" className="next" onClick={next}>{step.key === 'target_date' && !answers.target_date ? '건너뛰기' : '다음'}</button>}</div>
      </section>
    </div>
  </main>
}
