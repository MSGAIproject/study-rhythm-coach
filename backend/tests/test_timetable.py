import asyncio
import httpx
import pytest
from app import store
from app.main import app

@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'DATA_DIR', tmp_path)


def request(method='GET', day='2026-09-13', entries=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.request(method, f'/api/timetable/{day}', json={'entries': entries} if entries is not None else None)
    return asyncio.run(run())


def seed_entries():
    entries = [{'id': str(hour), 'subject': '자유 과목', 'title': '내 공부', 'start_time': f'{hour:02}:00', 'end_time': f'{hour+1:02}:00', 'completed': False} for hour in range(8, 13)]
    assert request('PUT', entries=entries).status_code == 200
    return request().json()['entries']


def test_add_edit_check_reload_and_date_isolation():
    entries = seed_entries()
    assert len(entries) == 5
    assert all(not item['completed'] for item in entries)
    entries.insert(0, {'id': 'evening', 'subject': '통합과학', 'title': '오답 복습', 'start_time': '17:00', 'end_time': '18:00', 'completed': False})
    result = request('PUT', entries=entries)
    assert result.status_code == 200
    assert result.json()['entries'][-1]['id'] == 'evening'
    entries = result.json()['entries']
    entries[-1].update(title='기출 10문제', start_time='18:00', end_time='19:00', completed=True)
    assert request('PUT', entries=entries).status_code == 200
    saved = request().json()['entries']
    assert saved[-1]['completed'] is True
    assert saved[-1]['title'] == '기출 10문제'
    assert saved[-1]['start_time'] == '18:00:00'
    assert request(day='2026-09-14').json()['entries'] == []
    saved[-1]['completed'] = False
    assert request('PUT', entries=saved).status_code == 200
    assert request().json()['entries'][-1]['completed'] is False
    assert request('PUT', entries=[]).status_code == 200
    assert request().json()['entries'] == []


@pytest.mark.parametrize('changes', [
    {'end_time': '07:40'}, {'end_time': '08:00'}, {'title': '  '},
    {'subject': ''}, {'start_time': '25:00'}, {'start_time': '08:40+09:00'},
])
def test_invalid_entry_not_saved(changes):
    original = seed_entries()
    entries = [dict(item) for item in original]
    entries[0].update(changes)
    assert request('PUT', entries=entries).status_code == 422
    assert request().json()['entries'] == original


def test_overlap_duplicate_and_adjacent_times():
    entries = seed_entries()
    entries[1]['start_time'] = '08:30'
    assert request('PUT', entries=entries).status_code == 422
    entries[1]['start_time'] = '09:00'
    assert request('PUT', entries=entries).status_code == 200
    entries[1]['id'] = entries[0]['id']
    assert request('PUT', entries=entries).status_code == 422


def test_invalid_date():
    assert request(day='not-a-date').status_code == 422


def test_empty_day_and_full_last_hour():
    assert request().json() == {'entries': []}
    entry = {'id': 'night', 'subject': '독서', 'title': '자유 독서', 'start_time': '23:00', 'end_time': '24:00'}
    assert request('PUT', entries=[entry]).status_code == 200
    assert request().json()['entries'][0]['end_time'] == '24:00:00'
    entry['end_time'] = '24:30'
    assert request('PUT', entries=[entry]).status_code == 422
