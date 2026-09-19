"""Official EBSi calendar, exam score history and explicit study targets."""
from datetime import date, datetime, timezone
from html import unescape
from pathlib import Path
import json
import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app import store

SOURCE_URL = 'https://cloud.ebsi.co.kr/ebs/xip/xipa/retrieveExmSchedRngNext.ebs?tab=1&targetCd=D300'
SEED_FILE = Path(__file__).with_name('exam_calendar_seed.json')
SUBJECTS = {'국어', '수학', '영어', '한국사', '통합사회', '통합과학', '탐구1', '탐구2'}
router = APIRouter(prefix='/api/exams', tags=['exams'])


def read_data(name, fallback):
    path = store.data_dir() / name
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else fallback


def write_data(name, value):
    store.data_dir().mkdir(parents=True, exist_ok=True)
    path = store.data_dir() / name
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(path)


def parse_calendar(html):
    heading = re.search(r'<h3[^>]*>\s*(20\d{2})년 시험일정\s*</h3>', html)
    if not heading:
        raise ValueError('시험 일정 연도를 확인하지 못했습니다.')
    year = int(heading[1])
    exams = []
    def clean(value):
        return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', '', value))).strip()
    for grade in (1, 2, 3):
        section = re.search(r'id=["\']tab5015_0' + str(grade) + r'["\'][^>]*>(.*?)</table>', html, re.S)
        if not section:
            raise ValueError('학년별 일정 표를 확인하지 못했습니다.')
        grade_exams = []
        for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', section[1], re.S):
            cells = [clean(value) for value in re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.S)]
            if len(cells) < 3 or not cells[1]:
                continue
            month = re.fullmatch(r'(\d{1,2})월', cells[0])
            day = re.match(r'^(\d{1,2})(?:일)?\s*\(', cells[1])
            if not month or not day:
                continue
            month = int(month[1])
            exam_date = date(year, month, int(day[1]))
            kind = '수능' if grade == 3 and month == 11 else '모의평가' if '평가원' in cells[2] else '전국연합학력평가'
            grade_exams.append({'id': f'{year}-g{grade}-{month:02}', 'year': year, 'grade': grade, 'date': exam_date.isoformat(), 'name': f'{month}월 {kind}', 'organizer': cells[2], 'source_url': SOURCE_URL})
        if len(grade_exams) < 4 or len({item['id'] for item in grade_exams}) != len(grade_exams):
            raise ValueError('시험 일정이 불완전합니다.')
        exams.extend(grade_exams)
    return {'year': year, 'exams': exams, 'checked_at': datetime.now(timezone.utc).isoformat(), 'source_url': SOURCE_URL}


def calendar():
    seed = json.loads(SEED_FILE.read_text(encoding='utf-8'))
    return read_data('exam-calendar.json', seed)


@router.get('/calendar')
async def get_calendar():
    return calendar()


@router.post('/calendar/sync')
async def sync_calendar():
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(SOURCE_URL)
            response.raise_for_status()
        fresh = parse_calendar(response.text)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'EBSi 일정을 갱신하지 못했어요. 마지막으로 확인한 일정은 그대로 사용할 수 있습니다.')
    previous = calendar()
    fresh['exams'] = [item for item in previous['exams'] if item['year'] != fresh['year']] + fresh['exams']
    write_data('exam-calendar.json', fresh)
    return fresh


class Score(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    grade: int | None = Field(default=None, ge=1, le=9)
    percentile: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    raw: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    standard: float | None = Field(default=None, ge=0, le=200, allow_inf_nan=False)
    elective: str = Field(default='', max_length=40)


class ExamResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scores: dict[str, Score] = Field(min_length=1, max_length=8)

    @model_validator(mode='after')
    def valid_scores(self):
        if not set(self.scores) <= SUBJECTS:
            raise ValueError('지원하지 않는 과목입니다.')
        if not any(any(getattr(score, metric) is not None for metric in ('grade', 'percentile', 'raw', 'standard')) for score in self.scores.values()):
            raise ValueError('성적을 한 과목 이상 입력해 주세요.')
        for subject in ('영어', '한국사'):
            score = self.scores.get(subject)
            if score and (score.percentile is not None or score.standard is not None):
                raise ValueError('영어와 한국사는 등급과 원점수만 입력합니다.')
        return self


@router.get('/results')
async def get_results():
    return read_data('exam-results.json', {})


@router.put('/results/{exam_id}')
async def save_result(exam_id: str, result: ExamResult):
    exam = next((item for item in calendar()['exams'] if item['id'] == exam_id), None)
    if not exam:
        raise HTTPException(404, '공식 일정에서 시험을 찾을 수 없습니다.')
    if date.fromisoformat(exam['date']) > date.today():
        raise HTTPException(422, '아직 시행하지 않은 시험에는 성적을 입력할 수 없습니다.')
    data = read_data('exam-results.json', {})
    saved = {**result.model_dump(mode='json'), 'exam': exam, 'updated_at': datetime.now(timezone.utc).isoformat()}
    data[exam_id] = saved
    write_data('exam-results.json', data)
    return saved


class TargetScore(BaseModel):
    grade: int | None = Field(default=None, ge=1, le=9)
    percentile: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)


class ExamGoal(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    university: str = Field(default='', max_length=120)
    department: str = Field(default='', max_length=120)
    reference_id: str | None = None
    targets: dict[str, TargetScore] = Field(default_factory=dict, max_length=8)

    @model_validator(mode='after')
    def valid_target(self):
        if not set(self.targets) <= SUBJECTS:
            raise ValueError('지원하지 않는 목표 과목입니다.')
        for subject in ('영어', '한국사'):
            if self.targets.get(subject) and self.targets[subject].percentile is not None:
                raise ValueError('영어와 한국사는 등급으로 비교합니다.')
        if self.reference_id and self.reference_id not in {item['id'] for item in REFERENCES}:
            raise ValueError('입시 비교 자료를 찾을 수 없습니다.')
        if self.reference_id:
            ref = next(item for item in REFERENCES if item['id'] == self.reference_id)
            if self.university != ref['university']:
                raise ValueError('목표 대학과 비교 자료의 대학이 다릅니다.')
        return self


JBNU_URL = 'https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2026&unvCd=0000025'
REFERENCES = [
    {'id': 'jbnu-2025-engineering1', 'university': '전북대학교', 'department': '공학계열 1', 'year': 2025, 'selection': '정시 나군 일반전형', 'source_url': JBNU_URL, 'cut_score': 314.12, 'maximum': 500,
     'subjects': {'국어': {'percentile': 67}, '수학': {'percentile': 62}, '탐구1': {'percentile': 68}, '탐구2': {'percentile': 54}, '영어': {'grade': 2}, '한국사': {'grade': 3}},
     'note': '2025학년도 공학계열 1 공개 결과입니다. 전기공학과는 모집단위 개편에 따라 공학계열 1로 안내된 이력이 있으므로 지원 학년도의 모집요강을 확인하세요.'},
    {'id': 'jbnu-2025-engineering2', 'university': '전북대학교', 'department': '공학계열 2', 'year': 2025, 'selection': '정시 나군 일반전형', 'source_url': JBNU_URL, 'cut_score': 314.85, 'maximum': 500,
     'subjects': {'국어': {'percentile': 80}, '수학': {'percentile': 47}, '탐구1': {'percentile': 84}, '탐구2': {'percentile': 61}, '영어': {'grade': 3}, '한국사': {'grade': 2}},
     'note': '공학계열 2 모집단위의 결과입니다. 개별 학과 결과와 같지 않습니다.'},
]


@router.get('/references')
async def references():
    return REFERENCES


@router.get('/goal')
async def get_goal():
    return read_data('exam-goal.json', None)


@router.put('/goal')
async def save_goal(goal: ExamGoal):
    data = goal.model_dump(mode='json')
    write_data('exam-goal.json', data)
    return data
