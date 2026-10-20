from __future__ import annotations

import gzip
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

import constellation.serve as serve
from constellation.performance import SnapshotCache


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def study(tmp_path: Path) -> Path:
    trial = tmp_path / 'runs/sessions/demo/generation/trials/1'
    write(trial / 'sandbox/worktree/constellation.json', {
        'version': 1, 'goal': {'id': 'goal', 'title': '调研题目'},
        'nodes': [{'id': 't1', 'title': '任务', 'agents': ['research']}],
        'edges': [{'from': 'goal', 'to': 't1', 'relation': 'parent'}],
    })
    write(trial / 'sandbox/worktree/task_board.json', {'tasks': {'t1': {'resolution': 'in_progress'}}})
    write(trial.parent.parent.parent / 'session.json', {'question': '完整问题' * 100, 'status': 'running'})
    events = [
        {'t': 'llm', 'tool_calls': [{'name': 'web_search', 'args': {'q': ['可核验的数据']}}]},
        {'t': 'result', 'name': 'web_search', 'result': '检索结果' * 400},
    ]
    folder = trial / 'agent/trajectories/subagents'
    folder.mkdir(parents=True)
    (folder / 'research.jsonl').write_text('\n'.join(json.dumps(e, ensure_ascii=False) for e in events) + '\n')
    return trial


def test_snapshot_reuses_work_and_invalidates_on_trajectory_board_and_session_changes(tmp_path, monkeypatch):
    trial = study(tmp_path)
    calls = []
    build = serve.build_view
    def counted(path):
        calls.append(path)
        return build(path)
    monkeypatch.setattr(serve, 'build_view', counted)
    first = serve._cached_entry(trial)
    assert serve._cached_entry(trial) is first
    assert len(calls) == 1
    compact = first['snapshot']['nodes'][1]
    detail = first['details']['t1']
    assert compact['steps'] == [] and compact['step_count'] == 1
    assert compact['steps_revision'] == detail['steps_revision']
    assert detail['steps'][0]['tool'] == 'web_search'
    assert set(first['thumbnail']['nodes'][1]).isdisjoint({'steps', 'notes', 'title', 'agents'})
    log = trial / 'agent/trajectories/subagents/research.jsonl'
    with log.open('a') as handle:
        handle.write(json.dumps({'t': 'compaction', 'tokens_before': 1000, 'tokens_after': 200}) + '\n')
    changed = serve._cached_entry(trial)
    assert changed['view']['version'] == first['view']['version']
    assert changed['snapshot']['nodes'][1]['step_count'] == 2
    assert changed['details']['t1']['steps_revision'] != detail['steps_revision']
    assert len(calls) == 2
    write(trial / 'sandbox/worktree/task_board.json', {'tasks': {'t1': {'resolution': 'resolved'}}})
    assert serve._cached_entry(trial)['snapshot']['nodes'][1]['status'] == 'resolved'
    write(trial.parent.parent.parent / 'session.json', {'question': '完整问题', 'status': 'finished'})
    assert serve._cached_entry(trial)['snapshot']['running'] is False
    write(trial / 'sandbox/outputs/report.md', {'report': True})
    assert serve._cached_entry(trial)['snapshot']['report'] is True


def test_concurrent_readers_share_one_build_and_failures_are_retryable():
    cache = SnapshotCache(2)
    barrier = threading.Barrier(8)
    calls = []
    def read(_):
        barrier.wait(timeout=5)
        return cache.get('study', 'revision', lambda: calls.append(1) or {'ready': True})
    with ThreadPoolExecutor(max_workers=8) as pool:
        values = list(pool.map(read, range(8)))
    assert len(calls) == 1
    assert all(value is values[0] for value in values)
    def fail():
        raise ValueError('partial file write')
    with pytest.raises(ValueError):
        cache.get('study', 'changed', fail)
    assert cache.get('study', 'changed', lambda: 'recovered') == 'recovered'
    for i in range(4):
        cache.get(i, i, lambda: i)
    assert len(cache._values) == 2


def test_http_snapshot_details_gzip_etag_and_static_invalidation(tmp_path, monkeypatch):
    trial = study(tmp_path)
    index = tmp_path / 'index.html'
    index.write_text('<html>' + '页面正文' * 2000 + '</html>')
    monkeypatch.setattr(serve, '_INDEX', index)
    server = serve.make_home_server(tmp_path / 'runs', port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_address[1]}'
    api = origin + '/api/studies/sessions/demo/1'
    try:
        with urlopen(Request(api + '/snapshot', headers={'Accept-Encoding': 'gzip'})) as response:
            assert response.headers['Content-Encoding'] == 'gzip'
            assert response.headers['Cache-Control'] == 'private, no-cache'
            tag = response.headers['ETag']
            payload = json.loads(gzip.decompress(response.read()))
        assert payload['nodes'][1]['steps'] == []
        assert payload['detail_mode'] == 'on-demand'
        with urlopen(api + '/node?id=t1') as response:
            assert json.load(response)['steps'][0]['tool'] == 'web_search'
        with urlopen(api + '/thumbnail') as response:
            assert 'goal' not in json.load(response)  # no full prompt in home thumbnails
        with pytest.raises(HTTPError) as cached:
            urlopen(Request(api + '/snapshot', headers={'If-None-Match': tag}))
        assert cached.value.code == 304
        assert cached.value.read() == b''
        cached.value.close()
        with urlopen(origin + '/study/sessions/demo/1') as response:
            html_tag = response.headers['ETag']
        index.write_text('<html>updated</html>')
        with urlopen(Request(origin + '/study/sessions/demo/1', headers={'If-None-Match': html_tag})) as response:
            assert response.status == 200
            assert response.read() == b'<html>updated</html>'
        with urlopen(Request(api + '/snapshot', headers={'Accept-Encoding': 'gzip;q=0, *;q=1'})) as response:
            assert response.headers.get('Content-Encoding') is None
        with urlopen(Request(api + '/snapshot', method='HEAD')) as response:
            assert response.status == 200 and response.read() == b''
        with urlopen(origin + '/api/history?compact=1') as response:
            assert 'question' not in json.load(response)[0]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_abandoned_live_call_expires_without_file_changes(tmp_path, monkeypatch):
    trial = study(tmp_path)
    log = trial / 'agent/trajectories/subagents/research.jsonl'
    first = serve._cached_entry(trial)
    assert first['snapshot']['nodes'][1]['live']
    monkeypatch.setattr(serve.time, 'time', lambda: log.stat().st_mtime + serve._LIVE_STALE_SECONDS + 2)
    expired = serve._cached_entry(trial)
    assert expired['snapshot']['nodes'][1]['live'] == []
    assert expired['view']['revision'] != first['view']['revision']
