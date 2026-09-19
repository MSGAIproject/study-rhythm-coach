import asyncio
from datetime import date, timedelta
import httpx
import pytest
from app import store
from app.main import app
from app.models import StudyTask
from app.task_allocation import daily_allocation, effective_start

@pytest.fixture(autouse=True)
def isolate(tmp_path,monkeypatch):
    monkeypatch.setattr(store,'DATA_DIR',tmp_path)
    monkeypatch.setattr(store,'TASKS_FILE',tmp_path/'tasks.json')

def task(**changes):
    return StudyTask(id='A',subject='수학',title='기출',estimated_minutes=103,created_at='2026-09-13',**{'start_date':date(2026,9,28),'target_date':date(2026,10,2),'start_page':11,'end_page':33,**changes})

def test_allocation_preserves_totals_and_date_boundaries():
    item=task()
    rows=[daily_allocation(item,item.start_date+timedelta(days=i)) for i in range(5)]
    assert sum(row[0] for row in rows)==103
    assert rows[0][1]==11 and rows[-1][2]==33
    assert all(rows[i][2]+1==rows[i+1][1] for i in range(4))
    assert daily_allocation(item,date(2026,9,27))==(0,None,None)
    assert daily_allocation(item,date(2026,10,3))==(0,None,None)
    assert effective_start(task(start_date=None))==date(2026,9,13)

def request(method,path,payload=None):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            return await client.request(method,path,json=payload)
    return asyncio.run(run())

def test_create_and_patch_date_validation_preserves_saved_task():
    payload={'subject':'수학','title':'책 한 권','estimated_minutes':3000,'start_date':'2026-09-20','target_date':'2026-10-20'}
    saved=request('POST','/api/tasks',payload)
    assert saved.status_code==201
    item=saved.json()
    assert item['start_date']=='2026-09-20'
    assert request('GET','/api/tasks').json()[0]['start_date']=='2026-09-20'
    invalid=request('PATCH',f"/api/tasks/{item['id']}",{'target_date':'2026-09-19'})
    assert invalid.status_code==422
    assert request('GET','/api/tasks').json()[0]==item
    assert request('POST','/api/tasks',{**payload,'start_date':'2026-10-21'}).status_code==422


def test_few_pages_and_single_day():
    small=task(start_page=1,end_page=2)
    rows=[daily_allocation(small,small.start_date+timedelta(days=i)) for i in range(5)]
    assert sum(last-first+1 for _,first,last in rows if first is not None)==2
    assert daily_allocation(task(target_date=date(2026,9,28)),date(2026,9,28))==(103,11,33)
