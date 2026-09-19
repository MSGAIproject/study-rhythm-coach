from app import store
from app.main import FRONTEND_DIST
from tests.test_api import request


def test_browser_data_is_isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "PROFILE_FILE", tmp_path / "profile.json")
    monkeypatch.setattr(store, "TASKS_FILE", tmp_path / "tasks.json")
    first = store.CLIENT_ID.set("11111111-1111-4111-8111-111111111111")
    (store.data_dir()).mkdir(parents=True)
    (store.data_dir() / "marker").write_text("first", encoding="utf-8")
    store.CLIENT_ID.reset(first)

    second = store.CLIENT_ID.set("22222222-2222-4222-8222-222222222222")
    assert not (store.data_dir() / "marker").exists()
    store.CLIENT_ID.reset(second)

    monkeypatch.setenv("REQUIRE_CLIENT_ID", "1")
    status, _ = request("GET", "/api/tasks")
    assert status == 400


def test_frontend_is_served():
    index = FRONTEND_DIST / "index.html"
    assert index.is_file()
    assert '<div id="root"></div>' in index.read_text(encoding="utf-8")
