import { useEffect, useState } from 'react'
import { EXAM_SUBJECTS, normalizedScores, scoreGap } from './examScores.js'
import { dateKey } from './studyTime.js'
import { apiFetch } from './api.js'

async function request(path, method = 'GET', body) {
  const response = await apiFetch(`/api/exams/${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '입력한 성적 범위를 확인해 주세요.')
  return data
}

function gapText(current, target, metric) {
  const gap = scoreGap(current, target, metric)
  if (target == null || target === '') return '목표 미설정'
  if (gap === null) return '성적 입력 필요'
  return gap ? `${gap}${metric === 'grade' ? '등급' : 'p'} 올리기` : '기준 충족'
}

function GradeHistory({ results, subject }) {
  const rows = Object.values(results).filter((result) => result.scores[subject]?.grade != null).sort((a, b) => a.exam.date.localeCompare(b.exam.date) || a.exam.grade - b.exam.grade)
  if (!rows.length) return <p className="exam-help">시험 성적을 저장하면 {subject} 등급 변화가 여기에 나타납니다.</p>
  const width = Math.max(440, rows.length * 90)
  const x = (index) => rows.length === 1 ? width / 2 : 40 + index * (width - 80) / (rows.length - 1)
  const y = (grade) => 25 + (grade - 1) * 20
  return <><div className="exam-chart-scroll"><svg viewBox={`0 0 ${width} 235`} style={{ minWidth: width }} role="img" aria-label={`${subject} 시험별 등급 변화. 1등급이 위쪽입니다.`}>
    {[1, 3, 5, 7, 9].map((grade) => <g key={grade}><line x1="28" x2={width - 15} y1={y(grade)} y2={y(grade)} stroke="#38383a" /><text x="2" y={y(grade) + 4} fill="#aeaeb2" fontSize="12">{grade}</text></g>)}
    <polyline points={rows.map((row, index) => `${x(index)},${y(row.scores[subject].grade)}`).join(' ')} fill="none" stroke="#8AB4F8" strokeWidth="3" />
    {rows.map((row, index) => <g key={row.exam.id}><circle cx={x(index)} cy={y(row.scores[subject].grade)} r="5" fill="#8AB4F8" /><text x={x(index)} y={y(row.scores[subject].grade) - 10} fill="#E8EAED" fontSize="13" textAnchor="middle">{row.scores[subject].grade}등급</text><text x={x(index)} y="210" fill="#aeaeb2" fontSize="11" textAnchor="middle">{row.exam.date.slice(2)}</text><text x={x(index)} y="228" fill="#aeaeb2" fontSize="11" textAnchor="middle">고{row.exam.grade}</text></g>)}
  </svg></div><details className="exam-history-list"><summary>성적 기록 목록 ({rows.length}회)</summary>{rows.map((row) => <p key={row.exam.id}>{row.exam.date} · 고{row.exam.grade} {row.exam.name} <strong>{row.scores[subject].grade}등급</strong></p>)}</details></>
}

export default function ExamProgress({ profile }) {
  const [calendar, setCalendar] = useState(null)
  const [results, setResults] = useState({})
  const [references, setReferences] = useState([])
  const [goal, setGoal] = useState(null)
  const [goalDraft, setGoalDraft] = useState(null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [grade, setGrade] = useState(1)
  const [examId, setExamId] = useState('')
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [subject, setSubject] = useState('국어')
  const [inquiry, setInquiry] = useState('integrated')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all(['calendar', 'results', 'references', 'goal'].map((path) => request(path))).then(([dates, history, refs, savedGoal]) => {
      if (!active) return
      const initial = savedGoal || { university: profile.hope_university || '', department: profile.hope_department || '', reference_id: profile.hope_university === '전북대학교' && profile.hope_department === '전기공학과' ? 'jbnu-2025-engineering1' : null, targets: Object.fromEntries(Object.entries(profile.required_subject_grades || {}).filter(([name, value]) => EXAM_SUBJECTS.includes(name) && /^[1-9]$/.test(value)).map(([name, value]) => [name, { grade: Number(value), percentile: null }])) }
      setCalendar(dates); setResults(history); setReferences(refs); setGoal(initial); setGoalDraft(initial)
      const available = dates.exams.filter((exam) => exam.year === dates.year && exam.grade === 1)
      const selected = available.filter((exam) => exam.date <= dateKey(new Date())).at(-1) || available[0]
      setGrade(1); setYear(dates.year); setInquiry('integrated'); setExamId(selected?.id || ''); setDraft(history[selected?.id]?.scores || {}); setError('')
    }).catch((err) => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, profile.hope_university, profile.hope_department, profile.required_subject_grades])

  function selectExam(id) {
    if (dirty && !window.confirm('저장하지 않은 성적 입력을 버리고 이동할까요?')) return false
    setExamId(id); setDraft(results[id]?.scores || {}); setDirty(false); setNotice(''); setError('')
    const saved = results[id]?.scores
    const item = calendar.exams.find((exam) => exam.id === id)
    setInquiry(saved?.탐구1 || saved?.탐구2 || (item && item.grade > 1 && item.year - item.grade < 2024) ? 'elective' : 'integrated')
    return true
  }
  function changeFilter(nextYear, nextGrade) {
    const list = calendar.exams.filter((exam) => exam.year === nextYear && exam.grade === nextGrade)
    const selected = list.filter((exam) => exam.date <= dateKey(new Date())).at(-1) || list[0]
    if (selectExam(selected?.id || '')) { setYear(nextYear); setGrade(nextGrade) }
  }
  async function sync() {
    setBusy(true); setError(''); setNotice('')
    try { const updated = await request('calendar/sync', 'POST'); setCalendar(updated); setNotice('EBSi의 공식 일정으로 갱신했어요.') }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function saveScores(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const scores = normalizedScores(draft)
      const saved = await request(`results/${examId}`, 'PUT', { scores })
      setResults((current) => ({ ...current, [examId]: saved })); setDraft(saved.scores); setDirty(false); setNotice('시험 성적을 저장했어요. 아래 비교와 그래프에 반영했습니다.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function saveGoal(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { ...goalDraft, targets: Object.fromEntries(Object.entries(goalDraft.targets).map(([name, value]) => [name, { grade: value.grade === '' || value.grade == null ? null : Number(value.grade), percentile: value.percentile === '' || value.percentile == null ? null : Number(value.percentile) }])) }
      const saved = await request('goal', 'PUT', payload)
      setGoal(saved); setGoalDraft(saved); setEditingGoal(false); setNotice('목표 대학과 과목별 목표를 저장했어요.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="exam-panel" role="status">시험 일정과 성적을 불러오는 중…</div>
  if (!calendar || !goal) return <div className="exam-panel"><p role="alert">{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}>다시 불러오기</button></div>
  const exams = calendar.exams.filter((exam) => exam.year === year && exam.grade === grade)
  const selectedExam = exams.find((exam) => exam.id === examId)
  const future = selectedExam && selectedExam.date > dateKey(new Date())
  const scores = results[examId]?.scores || {}
  const reference = references.find((item) => item.id === goal.reference_id)
  const scoreSubjects = ['국어', '수학', '영어', '한국사', ...(inquiry === 'integrated' ? ['통합사회', '통합과학'] : ['탐구1', '탐구2'])]
  const comparisonSubjects = EXAM_SUBJECTS.filter((name) => scores[name] || goal.targets[name])

  return <div className="exam-panel">
    <div className="exam-section-title"><div><span>내가 향하는 곳</span><h2>{goal.university || '목표 대학을 설정해 주세요'}</h2><p>{goal.department || '희망 학과 미설정'}</p></div><button type="button" disabled={busy} onClick={() => { setGoalDraft(goal); setEditingGoal((value) => !value) }}>{editingGoal ? '닫기' : '목표 설정'}</button></div>
    {editingGoal && <form className="exam-goal-form" onSubmit={saveGoal}>
      <div className="exam-filter-row"><label>희망 대학<input maxLength="120" value={goalDraft.university} onChange={(event) => setGoalDraft({ ...goalDraft, university: event.target.value, reference_id: null })} /></label><label>희망 학과<input maxLength="120" value={goalDraft.department} onChange={(event) => setGoalDraft({ ...goalDraft, department: event.target.value, reference_id: null })} /></label></div>
      <label>공식 입시 결과 비교 자료<select value={goalDraft.reference_id || ''} onChange={(event) => setGoalDraft({ ...goalDraft, reference_id: event.target.value || null })}><option value="">선택 안 함 · 나의 목표와 비교</option>{references.filter((item) => item.university === goalDraft.university.trim()).map((item) => <option value={item.id} key={item.id}>{item.year}학년도 {item.department} · {item.selection}</option>)}</select></label>
      <p className="exam-help">직접 정한 학습 목표입니다. 대학에서 요구하는 필수 등급을 뜻하지 않아요. 공식 비교 자료가 없는 대학도 목표를 직접 정할 수 있습니다.</p>
      <div className="exam-table-scroll"><table className="exam-table"><caption>과목별 나의 목표</caption><thead><tr><th>과목</th><th>목표 등급</th><th>목표 백분위</th></tr></thead><tbody>{EXAM_SUBJECTS.map((name) => <tr key={name}><th>{name}</th>{['grade', 'percentile'].map((metric) => <td key={metric}>{metric === 'percentile' && ['영어', '한국사'].includes(name) ? '—' : <input aria-label={`${name} 목표 ${metric === 'grade' ? '등급' : '백분위'}`} type="number" min={metric === 'grade' ? 1 : 0} max={metric === 'grade' ? 9 : 100} step={metric === 'grade' ? 1 : .01} value={goalDraft.targets[name]?.[metric] ?? ''} placeholder="미설정" onChange={(event) => setGoalDraft({ ...goalDraft, targets: { ...goalDraft.targets, [name]: { ...goalDraft.targets[name], [metric]: event.target.value } } })} />}</td>)}</tr>)}</tbody></table></div><button type="submit" disabled={busy}>목표 저장</button>
    </form>}
    <div className="exam-section-title"><div><h3>모의고사 성적 기록</h3><p>공식 시험일을 선택해 성적표를 기록하세요.</p></div><button type="button" disabled={busy || dirty} onClick={sync}>{busy ? '처리 중…' : '공식 일정 갱신'}</button></div>
    <p className="exam-source"><a href={calendar.source_url} target="_blank" rel="noreferrer">EBSi 최신 시험 일정 ↗</a> · 마지막 확인 {calendar.checked_at.slice(0, 10)} · 과거 일정은 교육청·학교 공개 자료</p>
    <div className="exam-filter-row"><label>시행 연도<select value={year} disabled={busy} onChange={(event) => changeFilter(Number(event.target.value), grade)}>{[...new Set(calendar.exams.map((exam) => exam.year))].sort().map((value) => <option key={value} value={value}>{value}년</option>)}</select></label><label>응시 학년<select value={grade} disabled={busy} onChange={(event) => changeFilter(year, Number(event.target.value))}>{[1, 2, 3].map((value) => <option key={value} value={value}>고{value}</option>)}</select></label></div>
    <div className="exam-picker">{exams.map((exam) => <button key={exam.id} type="button" disabled={busy} aria-pressed={examId === exam.id} onClick={() => selectExam(exam.id)}><time>{exam.date.slice(5).replace('-', '.')}</time><strong>{exam.name}</strong><small>{results[exam.id] ? '성적 저장됨' : exam.date > dateKey(new Date()) ? '예정' : '성적 입력'}</small></button>)}</div>
    {selectedExam && <form onSubmit={saveScores} className="exam-score-form"><h3>{selectedExam.date} · 고{grade} {selectedExam.name}</h3><p className="exam-help">{selectedExam.organizer} 주관 · <a href={selectedExam.source_url} target="_blank" rel="noreferrer">일정 출처 ↗</a> · 성적표의 모의고사 등급(1~9), 백분위, 원점수, 표준점수를 입력하세요.</p>
      {future ? <p className="exam-help">아직 시행하지 않은 시험입니다. 시험일 이후에 성적을 입력할 수 있어요.</p> : <>
        <label className="exam-inquiry-select">탐구 성적표 종류<select value={inquiry} disabled={busy} onChange={(event) => setInquiry(event.target.value)}><option value="integrated">통합사회 · 통합과학</option><option value="elective">선택 탐구 2과목</option></select></label>
        <div className="exam-table-scroll"><table className="exam-table score-input-table"><caption>시험별 성적 입력 · 모르는 항목은 빈칸으로 두세요</caption><thead><tr><th>과목</th><th>등급</th><th>백분위</th><th>원점수</th><th>표준점수</th></tr></thead><tbody>{scoreSubjects.map((name) => <tr key={name}><th>{name}{name.startsWith('탐구') && <input aria-label={`${name} 선택과목명`} placeholder="예: 물리학Ⅰ" maxLength="40" value={draft[name]?.elective || ''} onChange={(event) => { setDraft({ ...draft, [name]: { ...draft[name], elective: event.target.value } }); setDirty(true) }} />}</th>{['grade', 'percentile', 'raw', 'standard'].map((metric) => <td key={metric}>{['영어', '한국사'].includes(name) && ['percentile', 'standard'].includes(metric) ? '—' : <input type="number" aria-label={`${name} ${ {grade: '등급', percentile: '백분위', raw: '원점수', standard: '표준점수'}[metric] }`} min={metric === 'grade' ? 1 : 0} max={metric === 'grade' ? 9 : metric === 'standard' ? 200 : 100} step={metric === 'grade' ? 1 : .01} disabled={busy} placeholder="—" value={draft[name]?.[metric] ?? ''} onChange={(event) => { setDraft({ ...draft, [name]: { ...draft[name], [metric]: event.target.value } }); setDirty(true); setNotice('') }} />}</td>)}</tr>)}</tbody></table></div>
        <button type="submit" disabled={busy || !dirty}>{busy ? '저장 중…' : '성적 저장'}</button>{dirty && <span className="exam-unsaved">저장 전 변경사항이 있어요</span>}
      </>}
    </form>}
    {error && <p role="alert" className="focus-error">{error}</p>}{notice && <p role="status" className="exam-notice">{notice}</p>}
    <div className="exam-comparison"><h3>목표까지 얼마나 남았을까요?</h3><p className="exam-help">선택한 시험의 저장된 성적 ↔ 직접 설정한 목표</p>
      {!results[examId] ? <p className="exam-help">시험 성적을 저장하면 과목별로 필요한 상승 폭을 볼 수 있어요.</p> : <div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>과목</th><th>현재 → 목표 등급</th><th>필요 변화</th><th>현재 → 목표 백분위</th><th>필요 변화</th></tr></thead><tbody>{comparisonSubjects.map((name) => <tr key={name}><th>{name}</th><td>{scores[name]?.grade ?? '—'} → {goal.targets[name]?.grade ?? '—'}</td><td className="exam-gap">{gapText(scores[name]?.grade, goal.targets[name]?.grade, 'grade')}</td><td>{scores[name]?.percentile ?? '—'} → {goal.targets[name]?.percentile ?? '—'}</td><td className="exam-gap">{['영어', '한국사'].includes(name) ? '—' : gapText(scores[name]?.percentile, goal.targets[name]?.percentile, 'percentile')}</td></tr>)}</tbody></table></div>}
    </div>
    {reference ? <div className="exam-reference"><h3>{reference.year}학년도 {reference.university} {reference.department}</h3><p>{reference.selection} · 최종등록자 70% 위치 학생의 영역별 성적</p><p className="exam-help">{reference.note}</p><a href={reference.source_url} target="_blank" rel="noreferrer">어디가 공개 결과 원문 ↗</a>
      <div className="exam-table-scroll"><table className="exam-table"><thead><tr><th>과목</th><th>내 성적</th><th>공개 비교값</th><th>차이</th></tr></thead><tbody>{Object.entries(reference.subjects).map(([name, value]) => { const metric = value.grade == null ? 'percentile' : 'grade'; const unit = metric === 'grade' ? '등급' : '백분위'; return <tr key={name}><th>{name}</th><td>{scores[name]?.[metric] ?? '—'}</td><td>{value[metric]} {unit}</td><td className="exam-gap">{gapText(scores[name]?.[metric], value[metric], metric)}</td></tr> })}</tbody></table></div>
      <p className="exam-help">각 과목의 필수 합격선이 아닌 한 등록자의 성적입니다. 고1·고2 모의고사와 수능은 응시집단·교육과정이 달라 진학 참고용으로만 비교해요. 통합사회·통합과학을 과거 탐구1·2로 자동 환산하지 않습니다.</p>
    </div> : <p className="exam-help">‘목표 설정’에서 공식 비교 자료를 선택할 수 있어요. 자료가 없는 대학은 과목별 나의 목표를 기준으로 비교합니다.</p>}
    <div className="exam-section-title"><div><h3>시험별 성적 변화</h3><p>등급 숫자가 작을수록 높은 성적이에요.</p></div><label><span className="chart-sr-only">성적 변화 과목</span><select value={subject} onChange={(event) => setSubject(event.target.value)}>{EXAM_SUBJECTS.map((name) => <option key={name}>{name}</option>)}</select></label></div>
    <GradeHistory results={results} subject={subject} />
  </div>
}
