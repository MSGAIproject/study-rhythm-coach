import asyncio
import httpx
import pytest
from app import store
from app.main import app

@pytest.fixture(autouse=True)
def isolated_data(tmp_path, monkeypatch):
    monkeypatch.setattr(store, 'DATA_DIR', tmp_path)

def request(method='GET', payload=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.request(method, '/api/study-sessions', json=payload)
    return asyncio.run(run())

def session():
    return {'id': '721bc58c-b725-45c9-bc3c-5c876d92da99', 'subject': '수학', 'intervals': [
        {'start': '2026-09-13T23:50:00+09:00', 'end': '2026-09-14T00:10:00+09:00'},
        {'start': '2026-09-14T00:20:00+09:00', 'end': '2026-09-14T00:30:00+09:00'}]}

def test_persist_and_retry_without_duplicate():
    assert request().json() == []
    payload = session()
    saved = request('POST', payload)
    assert saved.status_code == 200
    assert request('POST', payload).status_code == 200
    assert request().json() == [saved.json()]
    payload['subject'] = '국어'
    assert request('POST', payload).status_code == 409
    assert len(request().json()) == 1

@pytest.mark.parametrize('intervals', [[],
    [{'start': '2026-09-13T12:00:00', 'end': '2026-09-13T13:00:00'}],
    [{'start': '2026-09-13T12:00:00Z', 'end': '2026-09-13T11:00:00Z'}],
    [{'start': '2026-09-13T12:00:00Z', 'end': '2026-09-13T13:00:00Z'},
     {'start': '2026-09-13T12:30:00Z', 'end': '2026-09-13T14:00:00Z'}]])
def test_invalid_intervals_leave_storage_unchanged(intervals):
    payload = session()
    payload['intervals'] = intervals
    assert request('POST', payload).status_code == 422
    assert request().json() == []
