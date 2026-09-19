import asyncio
import json
from datetime import date, timedelta

import httpx
import pytest

from app import coach
from app.main import app
from app.models import Priority, StudyTask, Subject
from tests.test_profile import sample_profile


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setattr(coach, 'load_profile', sample_profile)
    monkeypatch.setattr(coach, 'list_tasks', lambda: [])
    monkeypatch.setattr(coach, 'CoachSettings', lambda: settings)
    from types import SimpleNamespace
    from pydantic import SecretStr
    settings = SimpleNamespace(gemini_api_key=SecretStr(''), gemini_model='test-gemini', openai_api_key=SecretStr('test-key'), openai_model='test-model')
    return settings


def call(path, payload=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.get(path) if payload is None else await client.post(path, json=payload)
    return asyncio.run(run())


def test_missing_key_and_profile(setup, monkeypatch):
    from pydantic import SecretStr
    setup.openai_api_key = SecretStr('')
    assert call('/api/coach/status').json() == {'configured': False}
    assert call('/api/coach/advice', {'study_method': '인강을 매일 봐요'}).status_code == 503
    assert call('/api/coach/plan', {}).status_code == 503
    monkeypatch.setattr(coach, 'load_profile', lambda: None)
    assert call('/api/coach/advice', {'study_method': '인강을 매일 봐요'}).status_code == 409
    assert call('/api/coach/plan', {}).status_code == 409


def test_blank_method_rejected(setup):
    assert call('/api/coach/advice', {'study_method': '     '}).status_code == 422


@pytest.mark.parametrize('status,data,expected', [
    (200, {'status': 'completed', 'output': [{'type': 'reasoning'}, {'type': 'message', 'content': [{'type': 'output_text', 'text': '오답을 다음 날 다시 풀어 보세요.'}]}]}, 200),
    (200, {'status': 'completed', 'output': []}, 502),
    (200, {'status': 'incomplete', 'output': []}, 502),
    (401, {'error': 'secret upstream error'}, 502),
    (429, {}, 429),
    (504, {}, 504),
])
def test_advice_provider(setup, monkeypatch, status, data, expected):
    original_post = httpx.AsyncClient.post
    async def post(client, url, **kwargs):
        if url == 'https://api.openai.com/v1/responses':
            body = kwargs['json']
            context = json.loads(body['input'])
            assert context['study_method'] == '인강을 매일 봐요'
            assert context['profile']['goal_description'] == sample_profile().goal_description
            assert context['profile']['learning_preferences'] == ['직접 문제 풀기', '짧게 자주 반복']
            assert 'fixed_schedule_notes' not in context['profile']
            assert body['store'] is False
            assert kwargs['headers']['Authorization'] == 'Bearer test-key'
            if status == 504:
                raise httpx.ReadTimeout('timeout')
            return httpx.Response(status, json=data, request=httpx.Request('POST', url))
        return await original_post(client, url, **kwargs)
    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    result = call('/api/coach/advice', {'study_method': '인강을 매일 봐요'})
    assert result.status_code == expected
    assert 'secret' not in result.text
    assert 'test-key' not in result.text
    if expected == 200:
        assert result.json()['advice'] == '오답을 다음 날 다시 풀어 보세요.'


@pytest.mark.parametrize('data,expected', [
    ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [
        {'text': 'hidden reasoning', 'thought': True}, {'text': '복습하세요.'}]}}]}, 200),
    ({'candidates': []}, 502),
    ({'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': 'partial'}]}}]}, 502),
    ({'candidates': [{'finishReason': 'STOP', 'content': {'parts': []}}]}, 502),
])
def test_gemini_advice(setup, monkeypatch, data, expected):
    from pydantic import SecretStr
    setup.gemini_api_key = SecretStr('gemini-test-key')
    assert call('/api/coach/status').json() == {'configured': True}
    original_post = httpx.AsyncClient.post

    async def post(client, url, **kwargs):
        if url.startswith('https://generativelanguage.googleapis.com/'):
            assert url.endswith('/test-gemini:generateContent')
            assert kwargs['headers'] == {'x-goog-api-key': 'gemini-test-key'}
            body = kwargs['json']
            context = json.loads(body['contents'][0]['parts'][0]['text'])
            assert context['study_method'] == '인강을 매일 봐요'
            assert 'fixed_schedule_notes' not in context['profile']
            assert body['systemInstruction']['parts'][0]['text']
            return httpx.Response(200, json=data, request=httpx.Request('POST', url))
        return await original_post(client, url, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    result = call('/api/coach/advice', {'study_method': '인강을 매일 봐요'})
    assert result.status_code == expected
    if expected == 200:
        assert result.json()['advice'] == '복습하세요.'


def test_plan_uses_complete_profile_context_and_can_be_accepted(setup, monkeypatch, tmp_path):
    task = StudyTask(
        id='TASK-BOOK', subject=Subject.MATH, title='미적분 자이스토리', estimated_minutes=600,
        completed_minutes=100, start_date=date(2026, 9, 16), target_date=date(2026, 10, 3),
        priority=Priority.HIGH, notes='오답 표시', start_page=10, end_page=150,
        book_isbn13='9781234567897', book_publisher='테스트 출판사', book_cover='https://example.com/book.jpg',
        completed=False, created_at='2026-09-16T00:00:00+09:00',
    )
    completed = task.model_copy(update={'id': 'TASK-DONE', 'completed': True, 'completed_minutes': 600})
    monkeypatch.setattr(coach, 'list_tasks', lambda: [task, completed])
    monkeypatch.setattr(coach.store, 'DATA_DIR', tmp_path)
    original_post = httpx.AsyncClient.post

    async def post(client, url, **kwargs):
        if url == 'https://api.openai.com/v1/responses':
            body = kwargs['json']
            context = json.loads(body['input'])
            assert context['plan_start_date']
            assert context['profile']['goal_description'] == sample_profile().goal_description
            assert context['profile']['learning_preferences'] == ['직접 문제 풀기', '짧게 자주 반복']
            assert context['profile']['fixed_schedule_notes'] == '화·목 수학 학원'
            assert context['profile']['weekday_study_start'] == '19:00:00'
            assert context['registered_task_count'] == 1
            assert context['tasks_truncated'] is False
            assert len(context['registered_tasks']) == 1
            registered = context['registered_tasks'][0]
            assert registered['title'] == '미적분 자이스토리'
            assert registered['start_page'] == 10
            assert registered['end_page'] == 150
            assert registered['target_date'] == '2026-10-03'
            assert registered['book_publisher'] == '테스트 출판사'
            assert 'book_cover' not in registered
            assert body['store'] is False
            generated = {
                'summary': '수학을 우선하는 7일 계획입니다.',
                'goals': [{
                    'date': date.today().isoformat(), 'subject': '수학', 'title': '미적분 자이스토리',
                    'minutes': 50, 'source_task_id': 'TASK-BOOK', 'start_page': 10, 'end_page': 15,
                    'notes': '50분 집중 후 오답 표시',
                }] + [{
                    'date': (date.today() + timedelta(days=index)).isoformat(), 'subject': '영어',
                    'title': '영어 복습', 'minutes': 20, 'source_task_id': None,
                    'start_page': None, 'end_page': None, 'notes': '단어 복습',
                } for index in range(1, 7)],
                'checkpoints': ['계획한 페이지 완료율', '오답 재풀이 정답률', '집중 블록 완료 수'],
            }
            return httpx.Response(200, json={
                'status': 'completed',
                'output': [{'type': 'message', 'content': [
                    {'type': 'output_text', 'text': json.dumps(generated, ensure_ascii=False)}
                ]}],
            }, request=httpx.Request('POST', url))
        return await original_post(client, url, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, 'post', post)
    result = call('/api/coach/plan', {})
    assert result.status_code == 200
    draft = result.json()
    assert draft['plan_start_date'] == date.today().isoformat()
    assert draft['plan_end_date'] == (date.today() + timedelta(days=6)).isoformat()
    assert draft['goals'][0]['source_task_id'] == 'TASK-BOOK'
    assert '미적분 자이스토리' in draft['plan']

    accepted = call('/api/coach/plan/accept', {
        'plan_id': draft['plan_id'], 'plan_start_date': draft['plan_start_date'],
        'plan_end_date': draft['plan_end_date'], 'goals': draft['goals'],
    })
    assert accepted.status_code == 200
    assert accepted.json()['goals'][0]['start_page'] == 10
    assert call('/api/coach/plan/accepted').json() == accepted.json()
