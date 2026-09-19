import { useEffect, useRef, useState } from 'react'
import { apiFetch } from './api.js'

export async function requestTimetable(date, entries) {
  const response = await apiFetch(`/api/timetable/${date}`, entries === undefined ? undefined : {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
  })
  const data = await response.json()
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg.replace(/^Value error, /, '')).join(' ') : data.detail
    throw new Error(detail || '계획표를 저장하지 못했습니다.')
  }
  return data.entries
}

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

export default function StudyTimetable({ initialDate, selectedDate, embedded = false, onEntriesChange }) {
  const formRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [date, setDate] = useState(initialDate)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    requestTimetable(date).then((items) => { if (active) { setEntries(items); setLoading(false); onEntriesChange?.(date, items) } })
      .catch(() => { if (active) setError('계획표를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.') })
    return () => { active = false }
  }, [date, reload])

  useEffect(() => {
    if (selectedDate && selectedDate !== date) selectDate(selectedDate)
  }, [selectedDate, date])

  useEffect(() => {
    if (draft) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [draft?.id])

  function addHour(hour) {
    setError(''); setNotice('')
    setDraft({ id: `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`, subject: '', title: '', start_time: HOURS[hour], end_time: hour === 23 ? '24:00' : HOURS[hour + 1], completed: false })
  }

  async function save(next) {
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await requestTimetable(date, next)
      setEntries(saved)
      onEntriesChange?.(date, saved)
      setNotice('계획표를 저장했습니다.')
      return true
    } catch (error) { setError(error.message); return false }
    finally { setBusy(false) }
  }

  async function submit(event) {
    event.preventDefault()
    const item = { ...draft, subject: draft.subject.trim(), title: draft.title.trim() }
    if (!item.subject || !item.title) { setError('과목과 공부할 내용을 입력해 주세요.'); return }
    if (item.end_time <= item.start_time) { setError('종료 시간은 시작 시간보다 늦어야 합니다.'); return }
    if (entries.some((entry) => entry.id !== item.id && item.start_time < entry.end_time.slice(0, 5) && item.end_time > entry.start_time.slice(0, 5))) {
      setError('다른 계획과 시간이 겹칩니다. 시간을 조정해 주세요.'); return
    }
    const next = entries.some((entry) => entry.id === item.id) ? entries.map((entry) => entry.id === item.id ? item : entry) : [...entries, item]
    if (await save(next)) setDraft(null)
  }

  const selectedDay = new Date(`${date}T12:00:00`)
  const monday = new Date(selectedDay)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(day.getDate() + index)
    return { label: ['월', '화', '수', '목', '금', '토', '일'][index], number: day.getDate(), key: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` }
  })
  function selectDate(value) {
    if (!value || value === date) return
    setDate(value); setLoading(true); setEntries([]); setDraft(null); setError(''); setNotice('')
  }

  return <section className={embedded ? 'timetable-card embedded-timetable' : 'card timetable-card'}>
    {!embedded && <div className="card-title"><div><span>나의 하루</span><h2>오늘의 일정</h2></div></div>}
    {!embedded && <>
    <div className="timetable-toolbar">
      <label>계획 날짜<input type="date" required value={date} disabled={busy} onChange={(event) => {
        if (!event.target.value) return
        selectDate(event.target.value)
      }} /></label>

    </div>
    <div className="calendar-week" aria-label="이번 주 날짜">{week.map((day) => <button type="button" key={day.key} disabled={busy} aria-label={`${day.key} ${day.label}요일`} aria-pressed={date === day.key} className={date === day.key ? 'selected' : ''} onClick={() => selectDate(day.key)}><span>{day.label}</span><strong>{day.number}</strong></button>)}</div>
    {!loading && !error && <div className="schedule-preview">{entries.length ? [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time)).map((entry) => <div className="schedule-preview-row" key={entry.id}>
      <label className="schedule-complete"><input type="checkbox" checked={entry.completed} disabled={busy || Boolean(draft)} onChange={() => save(entries.map((item) => item.id === entry.id ? { ...item, completed: !item.completed } : item))} aria-label={`${entry.subject} ${entry.title} 완료`} /><span aria-hidden="true">{entry.completed ? '✓' : ''}</span></label>
      <button type="button" className="schedule-open" disabled={busy || Boolean(draft)} onClick={() => { setExpanded(true); setError(''); setDraft({ ...entry, start_time: entry.start_time.slice(0, 5), end_time: entry.end_time.slice(0, 5) }) }}><strong>{entry.subject} · {entry.title}</strong><time>{entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)}</time></button>
      <span className={`schedule-badge ${entry.completed ? 'done' : ''}`}>{entry.completed ? '완료' : '예정'}</span>
    </div>) : <div className="schedule-empty"><strong>오늘은 어떤 공부를 할까요?</strong><p>시간표를 열어 첫 계획을 추가해 보세요.</p></div>}</div>}
    <p className="timetable-summary">{loading ? '계획표를 불러오는 중…' : `${entries.length}개 중 ${entries.filter((entry) => entry.completed).length}개 완료 · 날짜별로 저장됩니다.`}</p>
    </>}
    {error && <div role="alert" className="focus-error">{error}{loading && <button type="button" onClick={() => { setError(''); setReload((value) => value + 1) }}>다시 불러오기</button>}</div>}
    <p role="status" className="timetable-notice">{notice}</p>
    <button type="button" className="timetable-toggle" aria-expanded={expanded} aria-controls="timetable-details" onClick={() => setExpanded((value) => !value)}>{expanded ? '일정 편집 닫기 ▲' : '일정 추가·수정 ▼'}</button>
    <div id="timetable-details" hidden={!expanded}>
    <p className="timetable-summary">빈 시간의 ＋ 버튼을 눌러 한 시간 계획을 추가하세요. 시간과 과목은 자유롭게 바꿀 수 있어요.</p>
    {draft && <form ref={formRef} className="timetable-form" onSubmit={submit}>
      <h3>{entries.some((entry) => entry.id === draft.id) ? '계획 수정' : '새 계획'}</h3>
      <fieldset disabled={busy}>
        <label>시작 시간<input type="time" required value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} /></label>
        <label>종료 시간<select value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })}>{[...new Set([...HOURS.slice(1), '24:00', draft.end_time])].sort().map((value) => <option key={value} value={value}>{value === '24:00' ? '24:00 (자정)' : value}</option>)}</select></label>
        <label>과목<input required maxLength={40} value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="예: 수학, 통합과학" /></label>
        <label>공부할 내용<input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="예: 기출 10문제와 오답 복습" /></label>
      </fieldset>
      <div className="timetable-actions"><button type="submit" disabled={busy}>{busy ? '저장 중…' : '계획 저장'}</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setError('') }}>취소</button></div>
    </form>}
    {!loading && !entries.length && <p>아직 계획이 없습니다. 원하는 시간부터 채워 보세요.</p>}
    {!loading && <div className="hourly-grid">{HOURS.map((start, hour) => {
      const end = hour === 23 ? '24:00' : HOURS[hour + 1]
      const items = entries.filter((entry) => entry.start_time.slice(0, 5) >= start && entry.start_time.slice(0, 5) < end)
      const continuing = entries.filter((entry) => entry.start_time.slice(0, 5) < start && entry.end_time.slice(0, 5) > start)
      const occupied = entries.some((entry) => entry.start_time.slice(0, 5) < end && entry.end_time.slice(0, 5) > start)
      return <div className="hourly-row" key={start}><time className="hourly-label">{start}</time><div className="hourly-content">
        {continuing.map((entry) => <div className="hourly-continuing" key={entry.id}>{entry.completed ? '✓ ' : ''}{entry.subject} · {entry.title} <small>{entry.end_time.slice(0, 5)}까지</small></div>)}
        <ol className="timetable-list">{items.map((entry) => <li key={entry.id} className={entry.completed ? 'is-complete' : ''}>
      <label className="timetable-check"><input type="checkbox" checked={entry.completed} disabled={busy || Boolean(draft)} onChange={() => save(entries.map((item) => item.id === entry.id ? { ...item, completed: !item.completed } : item))} aria-label={`${entry.subject} ${entry.title} 완료`} /></label>
      <div className="timetable-entry"><time>{entry.start_time.slice(0, 5)}~{entry.end_time.slice(0, 5)}</time><strong>{entry.subject}</strong><span>{entry.title}</span></div>
      <div className="timetable-actions"><button type="button" disabled={busy || Boolean(draft)} aria-label={`${entry.title} 수정`} onClick={() => { setError(''); setNotice(''); setDraft({ ...entry, start_time: entry.start_time.slice(0, 5), end_time: entry.end_time.slice(0, 5) }) }}>수정</button><button type="button" disabled={busy || Boolean(draft)} aria-label={`${entry.title} 삭제`} onClick={() => { if (window.confirm(`‘${entry.title}’ 계획을 삭제할까요?`)) save(entries.filter((item) => item.id !== entry.id)) }}>삭제</button></div>
    </li>)}</ol>
        {!occupied && <button className="hourly-add" type="button" disabled={busy || Boolean(draft)} onClick={() => addHour(hour)} aria-label={`${start}부터 ${end}까지 계획 추가`}>＋ <span>{start}~{end} 계획 추가</span></button>}
      </div></div>
    })}</div>}
    </div>
  </section>
}
