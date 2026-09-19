import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'

async function request(url) {
  const response = await apiFetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '도서 정보를 불러오지 못했습니다.')
  return data
}

export default function TaskBookPicker({ selectedBook, onSelect }) {
  const [open, setOpen] = useState(false)
  const [configured, setConfigured] = useState(null)
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    request('/api/books/status').then((data) => setConfigured(data.configured)).catch(() => setConfigured(false))
  }, [])

  async function search() {
    const title = query.trim()
    if (!title) return
    setBusy(true); setError(''); setBooks([])
    try {
      const data = await request(`/api/books/search?query=${encodeURIComponent(title)}`)
      setBooks(data.items)
      if (!data.items.length) setError('검색 결과가 없습니다.')
    } catch (requestError) {
      setError(requestError.message)
    } finally { setBusy(false) }
  }

  async function choose(book) {
    if (!book.isbn13) { setError('이 책에는 ISBN13 정보가 없어 자동 입력할 수 없습니다.'); return }
    setBusy(true); setError('')
    try {
      const detail = await request(`/api/books/detail/${encodeURIComponent(book.isbn13)}`)
      onSelect(detail)
      setOpen(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally { setBusy(false) }
  }

  return <section className="task-book-picker">
    <div className="task-book-picker-heading"><div><strong>문제집 정보</strong><span>{selectedBook ? `${selectedBook.title} · ${selectedBook.pages ? `${selectedBook.pages}쪽` : '페이지 정보 없음'}` : 'YES24에서 책을 찾아 페이지를 자동 입력할 수 있어요.'}</span></div><button type="button" onClick={() => setOpen((value) => !value)} disabled={configured === false}>{open ? '책 찾기 닫기' : selectedBook ? '다른 책 찾기' : '책 찾기'}</button></div>
    {configured === false && <p className="focus-error">YES24 API 연결 설정을 확인해 주세요.</p>}
    {open && <div className="task-book-search"><div className="task-book-search-controls"><input type="search" value={query} maxLength={120} placeholder="문제집 제목 입력" aria-label="문제집 제목" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (!event.nativeEvent.isComposing) search() } }} /><button type="button" onClick={search} disabled={busy || !query.trim()}>{busy ? '검색 중…' : '검색'}</button></div>{error && <p className="focus-error" role="alert">{error}</p>}
      {books.length > 0 && <div className="task-book-results" aria-label="도서 검색 결과">{books.map((book) => <button type="button" key={book.itemId || book.isbn13 || book.title} onClick={() => choose(book)} disabled={busy}>{book.cover ? <img src={book.cover} alt="" /> : <span className="book-cover-empty">표지 없음</span>}<span><strong>{book.title}</strong><small>{[book.author, book.publisher].filter(Boolean).join(' · ')}</small><small>{book.pages ? `${book.pages}쪽` : '페이지 상세 조회 후 자동 입력'}</small></span></button>)}</div>}
    </div>}
    {selectedBook && <div className="selected-task-book">{selectedBook.cover && <img src={selectedBook.cover} alt="" />}<span><strong>{selectedBook.title}</strong><small>{[selectedBook.author, selectedBook.publisher, selectedBook.isbn13].filter(Boolean).join(' · ')}</small><small>{selectedBook.pages ? `전체 1~${selectedBook.pages}쪽을 자동 입력했습니다.` : '페이지 정보가 없어 범위를 직접 입력해 주세요.'}</small></span><button type="button" onClick={() => onSelect(null)}>선택 해제</button></div>}
  </section>
}
