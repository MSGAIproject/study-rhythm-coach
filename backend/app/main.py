from datetime import date
import os
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app import store
from app.models import DailyPlan, FocusSessionUpdate, StudentProfile, StudyBlock, StudyTask, StudyTaskCreate, StudyTaskUpdate, Subject
from app.coach import router as coach_router
from app.books import router as books_router
from app.timetable import router as timetable_router
from app.study_time import router as study_time_router
from app.exams import router as exams_router
from app.scheduler import generate_daily_plan
from app.admissions import search_admission_results
from app.store import add_task, delete_task, list_tasks, load_profile, save_profile, update_task


app = FastAPI(
    title="오름 API",
    description="수능 시간 흐름 적응과 학습 습관 형성을 돕는 로컬 학습 코치 API",
    version="0.1.0",
)

app.include_router(coach_router)
app.include_router(books_router)
app.include_router(timetable_router)
app.include_router(study_time_router)
app.include_router(exams_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Client-ID"],
)


@app.middleware("http")
async def isolate_browser_data(request, call_next):
    client_id = request.headers.get("X-Client-ID")
    if request.url.path.startswith("/api/") and os.environ.get("REQUIRE_CLIENT_ID") == "1" and not client_id:
        return JSONResponse({"detail": "브라우저 식별 정보가 필요합니다."}, status_code=400)
    token = None
    if client_id:
        try:
            normalized = str(UUID(client_id))
        except ValueError:
            return JSONResponse({"detail": "브라우저 식별 정보가 올바르지 않습니다."}, status_code=400)
        token = store.CLIENT_ID.set(normalized)
    try:
        return await call_next(request)
    finally:
        if token is not None:
            store.CLIENT_ID.reset(token)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/study-template", response_model=list[StudyBlock], tags=["planning"])
async def study_template() -> list[StudyBlock]:
    """Editable starter template; official exam times should be verified before deployment."""
    return [
        StudyBlock(subject=Subject.KOREAN, start_time="08:40", end_time="10:00", label="1교시 흐름 적응"),
        StudyBlock(subject=Subject.MATH, start_time="10:30", end_time="12:10", label="2교시 흐름 적응"),
        StudyBlock(subject=Subject.ENGLISH, start_time="13:10", end_time="14:20", label="3교시 흐름 적응"),
        StudyBlock(subject=Subject.KOREAN_HISTORY, start_time="14:50", end_time="15:20", label="한국사 흐름 적응"),
        StudyBlock(subject=Subject.INQUIRY, start_time="15:35", end_time="16:37", label="탐구 흐름 적응"),
    ]


@app.get("/api/profile", response_model=StudentProfile | None, tags=["profile"])
async def get_profile() -> StudentProfile | None:
    return load_profile()


@app.get("/api/admissions/search", tags=["admissions"])
async def search_admissions(university: str, department: str) -> dict:
    return {"results": search_admission_results(university, department)}


@app.put("/api/profile", response_model=StudentProfile, tags=["profile"])
async def update_profile(profile: StudentProfile) -> StudentProfile:
    return save_profile(profile)


@app.get("/api/tasks", response_model=list[StudyTask], tags=["tasks"])
async def get_tasks() -> list[StudyTask]:
    return list_tasks()


@app.post("/api/tasks", response_model=StudyTask, status_code=201, tags=["tasks"])
async def create_task(task: StudyTaskCreate) -> StudyTask:
    return add_task(task)


@app.patch("/api/tasks/{task_id}", response_model=StudyTask, tags=["tasks"])
async def patch_task(task_id: str, update: StudyTaskUpdate) -> StudyTask:
    try:
        task = update_task(task_id, update)
    except ValidationError as error:
        raise HTTPException(422, "시작·목표 날짜와 페이지 범위를 확인해 주세요.") from error
    if task is None:
        raise HTTPException(404, "학습 작업을 찾을 수 없습니다.")
    return task


@app.delete("/api/tasks/{task_id}", status_code=204, tags=["tasks"])
async def remove_task(task_id: str) -> Response:
    if not delete_task(task_id):
        raise HTTPException(404, "학습 작업을 찾을 수 없습니다.")
    return Response(status_code=204)


@app.post("/api/plans/generate", response_model=DailyPlan, tags=["planning"])
async def create_daily_plan(plan_date: date) -> DailyPlan:
    profile = load_profile()
    if profile is None:
        raise HTTPException(409, "기본 질문을 먼저 완료해 주세요.")
    return generate_daily_plan(profile, list_tasks(), plan_date)


@app.post("/api/focus-session", tags=["monitoring"])
async def update_focus_session(session: FocusSessionUpdate) -> dict:
    # 카메라 영상은 서버에 저장하지 않는 방향으로 후속 구현한다.
    return {"status": "active" if session.active else "stopped", **session.model_dump()}


@app.get('/api/camera-certificate', tags=['system'])
async def camera_certificate():
    certificate = Path(__file__).resolve().parents[2] / '.tls' / 'study-rhythm-ca.cer'
    if not certificate.exists():
        raise HTTPException(404, '휴대폰용 실행 스크립트를 먼저 실행해 주세요.')
    return FileResponse(certificate, media_type='application/x-x509-ca-cert', filename='study-rhythm-ca.cer')


FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
async def frontend(path: str):
    requested = (FRONTEND_DIST / path).resolve()
    if path and FRONTEND_DIST.resolve() in requested.parents and requested.is_file():
        return FileResponse(requested)
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(404, "프런트엔드 빌드를 찾을 수 없습니다.")
