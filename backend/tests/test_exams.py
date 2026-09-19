import asyncio
from datetime import date
from pathlib import Path
import httpx
import pytest
from app import store, exams
from app.main import app

@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'DATA_DIR', tmp_path)
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 9, 13)
    monkeypatch.setattr(exams, 'date', FixedDate)

def request(path, method='GET', payload=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.request(method, '/api/exams/' + path, json=payload)
    return asyncio.run(run())

def test_calendar_real_dates_grade_separation_and_2025_correction():
    items = request('calendar').json()['exams']
    assert len(items) == 45
    assert len({item['id'] for item in items}) == 45
    assert next(item for item in items if item['id'] == '2025-g1-06')['date'] == '2025-06-04'
    assert next(item for item in items if item['id'] == '2026-g3-05')['date'] == '2026-05-07'
    assert not any(item['id'] == '2026-g1-05' for item in items)


def test_official_parser_and_rejecting_incomplete_or_wrong_pages():
    html = Path(__file__).with_name('fixtures').joinpath('ebsi-calendar.html').read_text()
    parsed = exams.parse_calendar(html)
    assert len(parsed['exams']) == 15
    assert next(item for item in parsed['exams'] if item['id'] == '2026-g3-09')['name'] == '9월 모의평가'
    with pytest.raises(ValueError): exams.parse_calendar(html.replace('tab5015_03', 'unknown'))
    with pytest.raises(ValueError): exams.parse_calendar('<h3>입시 안내</h3>')


def test_score_roundtrip_revision_missing_values_and_year_grade_isolation():
    payload = {'scores': {'국어': {'grade': 3, 'percentile': 76}, '영어': {'grade': 2}}}
    assert request('results/2024-g1-03', 'PUT', payload).status_code == 200
    payload['scores']['국어']['grade'] = 2
    assert request('results/2024-g1-03', 'PUT', payload).status_code == 200
    assert request('results/2025-g2-03', 'PUT', payload).status_code == 200
    result = request('results').json()
    assert len(result) == 2
    assert result['2024-g1-03']['scores']['국어']['grade'] == 2
    assert result['2024-g1-03']['scores']['영어']['percentile'] is None
    assert result['2025-g2-03']['exam']['grade'] == 2


@pytest.mark.parametrize('scores', [ {}, {'국어': {'grade': 10}}, {'국어': {'percentile': 101}}, {'국어': {'grade': 2.5}}, {'영어': {'percentile': 90}}, {'국어': {'grade': None}}, {'모르는과목': {'grade': 3}}])
def test_invalid_scores_do_not_write(scores):
    assert request('results/2026-g1-03', 'PUT', {'scores': scores}).status_code == 422
    assert request('results').json() == {}


def test_unknown_and_future_exams_rejected():
    payload = {'scores': {'국어': {'grade': 3}}}
    assert request('results/missing', 'PUT', payload).status_code == 404
    assert request('results/2026-g1-10', 'PUT', payload).status_code == 422


def test_goals_and_reference_validation():
    payload = {'university': '전북대학교', 'department': '전기공학과', 'reference_id': 'jbnu-2025-engineering1', 'targets': {'국어': {'grade': 2, 'percentile': 90}}}
    assert request('goal', 'PUT', payload).status_code == 200
    assert request('goal').json()['targets']['국어']['grade'] == 2
    payload['university'] = '다른 대학'
    assert request('goal', 'PUT', payload).status_code == 422
    assert request('goal').json()['university'] == '전북대학교'


def test_sync_updates_current_year_preserves_history_and_fails_safely(monkeypatch):
    html = Path(__file__).with_name('fixtures').joinpath('ebsi-calendar.html').read_text()
    original_client = httpx.AsyncClient
    async def fetch(_self, url, **_kwargs):
        return httpx.Response(200, text=html, request=httpx.Request('GET', url))
    monkeypatch.setattr(original_client, 'get', fetch)
    assert request('calendar/sync', 'POST').status_code == 200
    assert len(request('calendar').json()['exams']) == 45
    previous = request('calendar').json()
    async def failure(_self, url, **_kwargs):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(original_client, 'get', failure)
    assert request('calendar/sync', 'POST').status_code == 503
    assert request('calendar').json() == previous
