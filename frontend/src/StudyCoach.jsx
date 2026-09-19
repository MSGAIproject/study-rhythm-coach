import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'

export default function StudyCoach({ profile, onSettings, onPlanAccepted }) {
  const [method, setMethod] = useState('')
  const [question, setQuestion] = useState('')
  const [configured, setConfigured] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [advice, setAdvice] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [planError, setPlanError] = useState('')
  const [plan, setPlan] = useState('')
  const [planDraft, setPlanDraft] = useState(null)
  const [acceptBusy, setAcceptBusy] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch('/api/coach/status').then(async (response) => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (active) setConfigured(data.configured)
    }).catch(() => { if (active) setError('AI 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.') })
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setAdvice('')
    try {
      const response = await apiFetch('/api/coach/advice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study_method: method.trim(), question: question.trim() }),
        signal: AbortSignal.timeout(70000),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '입력 내용을 확인해 주세요.')
      setAdvice(data.advice)
      setConfigured(true)
    } catch (error) {
      setError(error.name === 'TimeoutError' ? '응답 시간이 길어지고 있습니다. 다시 시도해 주세요.' : error.message || 'AI 연결에 실패했습니다.')
    } finally { setBusy(false) }
  }

  async function createPlan() {
    setPlanBusy(true)
    setPlanError('')
    setPlan('')
    setPlanDraft(null)
    try {
      const response = await apiFetch('/api/coach/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(70000),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '기본 설정을 확인해 주세요.')
      setPlan(data.plan)
      setPlanDraft(data)
      setConfigured(true)
    } catch (error) {
      setPlanError(error.name === 'TimeoutError' ? '응답 시간이 길어지고 있습니다. 다시 시도해 주세요.' : error.message || 'AI 연결에 실패했습니다.')
    } finally { setPlanBusy(false) }
  }

  async function acceptPlan() {
    if (!planDraft || acceptBusy) return
    setAcceptBusy(true)
    setPlanError('')
    try {
      const response = await apiFetch('/api/coach/plan/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planDraft.plan_id,
          plan_start_date: planDraft.plan_start_date,
          plan_end_date: planDraft.plan_end_date,
          goals: planDraft.goals,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '계획을 적용하지 못했습니다.')
      onPlanAccepted?.(data)
    } catch (error) {
      setPlanError(error.message || '계획을 적용하지 못했습니다.')
    } finally { setAcceptBusy(false) }
  }

  return <>
    <div className="tab-heading"><div><span>STUDY COACH</span><h1>AI 학습 코치</h1><p>나의 공부 방법과 성적을 바탕으로 다음 공부를 정해 보세요.</p></div></div>
    <section className="card coach-context">
      <div className="card-title"><div><span>분석에 사용할 정보</span><h2>{profile.hope_university || profile.goal_type}</h2></div><button type="button" onClick={onSettings}>성적·목표 수정</button></div>
      <p>{profile.goal_description} · {profile.focus_minutes}분 집중 / {profile.break_minutes}분 휴식</p>
      <div className="coach-preferences">{(profile.learning_preferences || []).map((preference) => <span key={preference}>{preference}</span>)}</div>
      {!(profile.learning_preferences || []).length && <p>기본 설정에서 선호하는 학습 방식을 고르면 계획의 활동을 더 구체적으로 맞출 수 있어요.</p>}
      <div className="coach-grades">{Object.entries(profile.current_subject_grades || {}).filter(([,grade]) => grade).map(([subject, grade]) => <span key={subject}>{subject}: {grade} → 목표 {profile.required_subject_grades?.[subject] || '미입력'}</span>)}</div>
      {!Object.values(profile.current_subject_grades || {}).some(Boolean) && <p>과목별 성적을 기본 설정에 입력하면 더 구체적인 조언을 받을 수 있어요.</p>}
    </section>
    <section className="card coach-plan-card">
      <div className="card-title"><div><span>설정으로 바로 시작</span><h2>7일 기본 학습 계획</h2></div><button type="button" onClick={createPlan} disabled={planBusy || configured === false}>{planBusy ? '계획 만드는 중…' : plan ? '계획 다시 만들기' : '기본 계획 만들기'}</button></div>
      <p>목표·성적·생활시간과 공부 관리에 등록한 교재·페이지·목표일을 바탕으로 오늘부터 7일간의 계획 초안을 만듭니다.</p>
      <p className="coach-note">계획 생성 시 기본 설정과 미완료 공부 작업 정보가 설정된 AI 제공업체(Gemini 또는 OpenAI)에 전송됩니다. 완료한 작업은 제외하며, 계획을 확인한 뒤 직접 수락해야 홈에 적용됩니다.</p>
      {configured === false && <p role="status">AI 연결 설정이 아직 완료되지 않았습니다. 서버 관리자에게 문의해 주세요.</p>}
      {planError && <p className="focus-error" role="alert">{planError}</p>}
      <div aria-live="polite" aria-busy={planBusy}>{planBusy && <p>생활시간과 목표를 맞춰 계획을 만들고 있어요. 잠시 기다려 주세요.</p>}{plan && <article className="coach-advice"><h2>나의 7일 기본 계획</h2><div>{plan}</div><button type="button" className="coach-accept-plan" onClick={acceptPlan} disabled={acceptBusy}>{acceptBusy ? '홈에 적용하는 중…' : '이 계획 사용하기'}</button></article>}</div>
    </section>
    <section className="card coach-card">
      <form className="coach-form" onSubmit={submit}>
        <label htmlFor="study-method">지금 어떻게 공부하고 있나요?</label>
        <textarea id="study-method" required minLength={5} maxLength={3000} rows={6} value={method} onChange={(event) => setMethod(event.target.value)} placeholder="예: 수학은 매일 인강 1시간을 듣고 문제 10개를 풀어요. 틀린 문제는 해설을 읽고 넘어가요. 복습은 시험 전에 해요." />
        <label htmlFor="coach-question">특히 도움받고 싶은 점 (선택)</label>
        <textarea id="coach-question" maxLength={1000} rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="예: 문제를 풀 때는 이해했는데 다음 날 다시 못 풀겠어요." />
        <p className="coach-note">분석을 요청하면 입력한 공부 방법과 저장된 성적·목표·학습 시간 정보가 설정된 AI 제공업체(Gemini 또는 OpenAI)에 전송됩니다. AI 조언은 실제 학습 결과를 보며 조정해 주세요.</p>
        {configured === false && <p role="status">AI 연결 설정이 아직 완료되지 않았습니다. 서버 관리자에게 문의해 주세요.</p>}
        <button type="submit" disabled={busy || method.trim().length < 5}>{busy ? '학습 방법 분석 중…' : '맞춤 학습 방법 받기'}</button>
      </form>
      {error && <p className="focus-error" role="alert">{error}</p>}
      <div aria-live="polite" aria-busy={busy}>{busy && <p>성적과 공부 방법을 함께 살펴보고 있어요. 잠시 기다려 주세요.</p>}{advice && <article className="coach-advice"><h2>나를 위한 학습 조언</h2><div>{advice}</div></article>}</div>
    </section>
  </>
}
