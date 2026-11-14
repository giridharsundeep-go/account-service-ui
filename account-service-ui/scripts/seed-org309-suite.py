#!/usr/bin/env python3
"""Create and verify bounded, synthetic test fixtures through local suite APIs."""
import argparse
from datetime import datetime, timedelta, timezone
from html import escape
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid4, uuid5


ORG, PROJECT = 309, 3734
MARKER = '[LOADTEST SUITE]'
COUNTS = {'astra': 120, 'folio': 60, 'grid': 60, 'prism': 60,
          'tempo': 210, 'gather': 24, 'desk': 48, 'instru': 6000}
CAMPAIGNS = ('Catalog discovery', 'Checkout reliability', 'Payments reconciliation',
             'Inventory accuracy', 'Fulfillment tracking', 'Release readiness')
SYNTHETIC = 'Synthetic organization 309 fixture. No customer work or production activity is implied.'
LOCALES = 'English · తెలుగు · हिन्दी · தமிழ் · 日本語 · العربية · עברית'
TZ = 'Asia/Kolkata'
START = datetime(2026, 11, 11, 4, tzinfo=timezone.utc)
WINDOW = {'from': '2026-11-01T00:00:00Z', 'to': '2027-02-01T00:00:00Z'}


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def iso(value):
    return value.isoformat().replace('+00:00', 'Z')


def uid(name):
    return str(uuid5(NAMESPACE_URL, f'gp-local-org309/{name}'))


def title(kind, index):
    return f'{MARKER} {kind} {index + 1:03d} · {CAMPAIGNS[index % len(CAMPAIGNS)]}'


class Suite:
    def __init__(self, token, apply, refresh_telemetry, pace_ms):
        self.token = token
        self.apply = apply
        self.refresh_telemetry = refresh_telemetry
        self.pace = pace_ms / 1000
        access = self.api(8080, '/api/session/access')
        check(int(access['user']['orgId']) == ORG, 'Use an authenticated org 309 session')
        self.owner = int(access['user']['id'])
        self.project = self.api(8080, f'/api/projects/{PROJECT}')
        check(int(self.project['org_id']) == ORG and self.project['name'].startswith('[DEMO]'),
              'The selected project is not the org 309 demonstration project')

    def api(self, port, path, method='GET', body=None, query=None, key=None):
        url = f'http://127.0.0.1:{port}{path}'
        if query:
            url += '?' + urlencode(query)
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        headers = {'Content-Type': 'application/json'}
        headers.update({'X-Instru-Key': key} if key else {'Authorization': 'Bearer ' + self.token})
        try:
            with urlopen(Request(url, data=data, headers=headers, method=method), timeout=25) as response:
                raw = response.read()
                result = json.loads(raw) if raw else None
                if method != 'GET':
                    time.sleep(self.pace)
                return result.get('data', result) if isinstance(result, dict) else result
        except HTTPError as exc:
            raise RuntimeError(f'{method} {port}{path}: HTTP {exc.code}') from None
        except (URLError, TimeoutError):
            raise RuntimeError(f'{method} {port}{path}: local service unavailable') from None

    def pages(self, port, path, query=None, cursor='offset', next_key='nextOffset'):
        pages, seen, position = [], set(), 0
        for _ in range(100):
            result = self.api(port, path, query={**(query or {}), cursor: position})
            rows = result['items']
            ids = {row['id'] for row in rows}
            check(len(ids) == len(rows) and not seen.intersection(ids), f'Duplicate records across {path} pages')
            pages.append(rows)
            seen.update(ids)
            next_position = result.get(next_key)
            if next_position is None or int(next_position) <= 0:
                return [row for page in pages for row in page], [len(page) for page in pages]
            check(next_position != position, f'Pagination did not advance for {path}')
            position = next_position
        raise RuntimeError(f'Pagination exceeded the safety limit for {path}')

    def fill(self, port, path, payloads, read, write=None, verify=None):
        existing, _ = read()
        wanted = {p['title']: p for p in payloads}
        matching = {row['title']: row for row in existing if row.get('title') in wanted}
        if not self.apply:
            return {'target': len(wanted), 'existing': len(matching), 'wouldCreate': len(wanted) - len(matching)}
        pending = [p for name, p in wanted.items() if name not in matching]
        if write:
            write(pending)
        else:
            for payload in pending:
                self.api(port, path, 'POST', payload)
        rows, sizes = read()
        matching = [row for row in rows if row.get('title') in wanted]
        check(len(matching) == len(wanted) and len({r['title'] for r in matching}) == len(wanted),
              f'Expected {len(wanted)} unique fixture titles from {path}')
        example = matching[0]
        if verify:
            verify(example)
        return {'verified': len(matching), 'created': len(pending), 'pageSizes': sizes, 'sampleId': example['id']}

    def astra(self):
        base = f'/api/projects/{PROJECT}/stories'
        data = self.api(8080, base)
        stories = data if isinstance(data, list) else data['items']
        stories = [r['id'] for r in stories if r.get('title', '').startswith('[DEMO]')]
        sprints = [s['id'] for s in self.project['sprints']]
        check(stories and sprints, 'Demo stories and sprints are required')
        def read():
            rows = [row for sid in stories for row in self.api(8080, f'/api/stories/{sid}/tasks')]
            return rows, [len(rows)]
        def write(rows):
            for n in range(0, len(rows), 20):
                self.api(8080, '/api/tasks/bulk-create', 'POST', rows[n:n + 20])
        states = ('BACKLOG', 'TODO', 'IN_PROGRESS', 'TESTING', 'COMPLETED', 'BLOCKED')
        payloads = [dict(title=title('Work item', n), description=f'{SYNTHETIC}\n{LOCALES}',
                         story_id=stories[n % len(stories)],
                         sprint_id=None if n % 6 == 0 else sprints[(n // 6) % len(sprints)],
                         status=states[n % 6]) for n in range(COUNTS['astra'])]
        return self.fill(8080, '/api/tasks', payloads, read, write,
                         lambda row: self.api(8080, f'/api/tasks/{row["id"]}'))

    def office(self, app):
        port, path, kind = {'folio': (8087, '/api/documents', 'Review memo'),
                            'grid': (8089, '/api/sheets', 'Delivery workbook'),
                            'prism': (8090, '/api/slides', 'Delivery briefing')}[app]
        query = {'q': 'LOADTEST'}
        if app == 'folio':
            query['projectId'] = PROJECT
        payloads = []
        for n in range(COUNTS[app]):
            name = title(kind, n)
            campaign = CAMPAIGNS[n % len(CAMPAIGNS)]
            payload = {'title': name, 'tags': ['loadtest-suite', 'delivery', campaign.lower().replace(' ', '-')]}
            if app == 'folio':
                payload.update(projectId=PROJECT,
                    content=f'<h1>{escape(name)}</h1><p>{SYNTHETIC}</p><h2>Review scope</h2>'
                            f'<p>Validate {campaign.lower()} against the release checklist and record open risks.</p>'
                            f'<ul><li>Review acceptance criteria</li><li>Record evidence and owners</li></ul>'
                            f'<p>{LOCALES}</p><pre><code>assert passed_checks &lt;= total_checks</code></pre>')
            elif app == 'grid':
                tabs = []
                for tab in ('Delivery', 'Quality'):
                    cells = {f'{col}1': {'value': value, 'style': {'fontWeight': 'bold'}}
                             for col, value in zip('ABCD', ('Workstream', 'Planned', 'Verified', 'Remaining'))}
                    for row, label in enumerate(CAMPAIGNS, 2):
                        planned = 12 + (n * 3 + row * 7) % 40
                        for col, value in zip('ABCD', (label, planned, planned - row, f'=B{row}-C{row}')):
                            cells[f'{col}{row}'] = {'value': str(value)}
                    cells.update(A8={'value': 'Total'}, B8={'value': '=SUM(B2:B7)'},
                                 C8={'value': '=SUM(C2:C7)'}, D8={'value': '=SUM(D2:D7)'},
                                 A10={'value': LOCALES}, A11={'value': SYNTHETIC})
                    tabs.append({'id': uid(f'grid/{n}/{tab}'), 'name': tab, 'rows': 40, 'cols': 12, 'cells': cells})
                payload['content'] = {'sheets': tabs}
            else:
                slides = []
                for i, (heading, detail) in enumerate(((campaign, SYNTHETIC),
                       ('Readiness', 'Review scope, regression evidence and open dependencies.'),
                       ('Decisions', 'Agree on owners, next steps and the release checkpoint.'),
                       ('Regional review', LOCALES))):
                    elements = [{'id': uid(f'prism/{n}/{i}/{y}'), 'type': 'text', 'x': 64, 'y': y,
                                 'w': 832, 'h': 120, 'text': value,
                                 'style': {'fontSize': size, 'color': '#172c52', 'textAlign': 'left'}}
                                for y, value, size in ((76, heading, '42px'), (220, detail, '25px'))]
                    slides.append({'id': uid(f'prism/{n}/{i}'), 'name': heading, 'background': '#ffffff',
                                   'notes': SYNTHETIC, 'transition': 'fade', 'elements': elements})
                payload['content'] = {'slides': slides}
            payloads.append(payload)
        def verify(row):
            detail = self.api(port, f'{path}/{row["id"]}')
            content = detail.get('content')
            check((isinstance(content, str) and 'Review scope' in content) if app == 'folio'
                  else bool(content and content.get('sheets' if app == 'grid' else 'slides')),
                  f'{app} detail did not return authored content')
        return self.fill(port, path, payloads, lambda: self.pages(port, path, query), verify=verify)

    def tempo(self):
        path, port = '/api/calendar/events', 8088
        payloads = []
        for n in range(COUNTS['tempo']):
            start = START + timedelta(days=n // 3, hours=(n % 3) * 2)
            payloads.append(dict(title=title('Calendar block', n), description=SYNTHETIC,
                                 startsAt=iso(start), endsAt=iso(start + timedelta(minutes=35)),
                                 timeZone=TZ, allDay=False, attendeeIds=[],
                                 location='Synthetic workspace', color=('blue', 'green', 'purple')[n % 3]))
        return self.fill(port, path, payloads, lambda: self.pages(port, path, WINDOW),
                         verify=lambda row: self.api(port, f'{path}/{row["id"]}'))

    def gather(self):
        path, port = '/api/meetings', 8091
        payloads = []
        for n in range(COUNTS['gather']):
            start = START + timedelta(days=n // 2, hours=7 + n % 2)
            payloads.append(dict(title=title('Review meeting', n), description=SYNTHETIC,
                                 startsAt=iso(start), endsAt=iso(start + timedelta(minutes=30)),
                                 timeZone=TZ, members=[]))
        def read():
            rows = self.api(port, path)
            count = sum(row['title'].startswith(MARKER) for row in rows)
            check(len(rows) - count + COUNTS['gather'] < 100, 'Gather list is too close to its 100-meeting limit')
            return rows, [len(rows)]
        result = self.fill(port, path, payloads, read)
        if self.apply:
            projections = self.api(8088, '/api/calendar/meetings', query=WINDOW)
            count = sum(row['title'].startswith(f'{MARKER} Review meeting') for row in projections)
            check(count == COUNTS['gather'], 'Tempo did not return all Gather meeting projections')
            result['tempoProjections'] = count
        return result

    def desk(self):
        port, path = 8080, '/api/operations/desk/cases'
        services = self.api(port, '/api/operations/services', query={'projectId': PROJECT})
        check(services, 'The demo project needs an existing service catalog')
        payloads = [dict(title=title('Support request', n), description=f'{SYNTHETIC} Reproduce on the demo workspace only.',
                         serviceId=services[n % len(services)]['id'], automatic=False,
                         priority=('LOW', 'MEDIUM', 'HIGH')[n % 3],
                         category=('REQUEST', 'INCIDENT', 'PROBLEM')[n % 3]) for n in range(COUNTS['desk'])]
        return self.fill(port, path, payloads, lambda: self.pages(port, path,
                         {'projectId': PROJECT, 'q': MARKER}, 'before', 'nextBefore'),
                         verify=lambda row: self.api(port, f'{path}/{row["id"]}'))

    def instru(self):
        port, base = 8094, '/api/instru'
        name = f'{MARKER} Checkout API'
        services = self.api(port, f'{base}/services')
        service = next((r for r in services if r['name'] == name and r['environment'] == 'synthetic'
                        and int(r.get('project_id') or 0) == PROJECT), None)
        if not self.apply:
            return {'targetSpans': COUNTS['instru'], 'serviceExists': bool(service)}
        key = None
        if not service:
            created = self.api(port, f'{base}/services', 'POST',
                               {'name': name, 'environment': 'synthetic', 'projectId': PROJECT})
            service, key = created['service'], created['ingestKey']
        sid = service['id']
        path = f'{base}/services/{sid}'
        dashboard = lambda: self.api(port, f'{path}/dashboard', query={'minutes': 60})
        before = dashboard()
        if key or self.refresh_telemetry or (not before['summary']['requests'] and not before['pipeline']):
            if not key:
                key = self.api(port, f'{path}/keys', 'POST', {'label': 'Temporary suite fixture ingestion'})['ingestKey']
            try:
                records = self.telemetry()
                for n in range(0, len(records), 200):
                    self.api(port, f'{base}/ingest', 'POST', {
                        'schemaVersion': 1, 'batchId': str(uuid4()), 'instanceId': 'checkout-fixture-01',
                        'records': records[n:n + 200]}, key=key)
            finally:
                from hashlib import sha256
                self.api(port, f'{path}/keys/{sha256(key.encode()).hexdigest()}', 'DELETE')
        for _ in range(20):
            state = dashboard()
            if not state['pipeline'] and int(state['summary']['requests']) >= COUNTS['instru']:
                return {'serviceId': sid, 'visibleRequests': state['summary']['requests'],
                        'errors': state['summary']['errors'], 'metricBuckets': len(state['series']),
                        'p99Ms': state['summary']['p99']}
            time.sleep(1)
        raise RuntimeError('Instru did not finish processing all fixture telemetry')

    @staticmethod
    def telemetry():
        now = int(time.time() * 1000)
        total = COUNTS['instru']
        gib = 1024 ** 3
        records = []
        for i in range(total):
            at = now - 1000 - (total - i) * 300
            version = 'fixture-1.0' if i < total // 2 else 'fixture-1.1'
            error = i % 223 == 0
            trace = uuid4().hex
            span_id = uuid4().hex[:16]
            row = lambda kind: dict(kind=kind, id=str(uuid4()), at=at, version=version)
            records.append(dict(row('span'), spanKind='HTTP_SERVER', traceId=trace, spanId=span_id,
                                name=('GET /api/catalog', 'POST /api/cart', 'POST /api/checkout',
                                      'GET /api/orders/{id}')[i % 4], status=503 if error else 200,
                                durationMs=(650 if error else 15) + (i * 37 % 281), error=error))
            if error:
                records.append(dict(row('error'), traceId=trace, exceptionClass='SyntheticCheckoutTimeout',
                                    message=SYNTHETIC, stack=['demo.checkout.PaymentGateway.authorize(PaymentGateway.java:48)']))
            if i % 100 == 0:
                records.append(dict(row('metric'), heapUsedBytes=gib + i * 200000, heapMaxBytes=4*gib,
                                    cpuPercent=18+i % 31, hostCpuPercent=28+i % 37, hostMemoryUsedBytes=6*gib,
                                    hostMemoryTotalBytes=16*gib, diskUsedBytes=32*gib, diskTotalBytes=128*gib,
                                    diskName='Synthetic volume', fileIoSupported=True,
                                    fileReadBytesPerSec=80000+i*12, fileWriteBytesPerSec=24000+i*8,
                                    threads=34+i % 25, nonHeapBytes=130000000, gcCollections=i // 100,
                                    gcPauseMs=3, uptimeMs=i*300, droppedRecords=0))
                records.append(dict(row('event'), name='LOGIN', outcome='FAILURE' if i % 1300 == 0 else 'SUCCESS'))
            if i in (0, total // 2):
                records.append(dict(row('event'), name='DEPLOYMENT'))
        return records

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session-file', type=Path, required=True, help='Private authenticated org 309 JSON')
    parser.add_argument('--apply', action='store_true', help='Create missing fixtures; default is read-only')
    parser.add_argument('--apps', nargs='+', choices=COUNTS, default=list(COUNTS))
    parser.add_argument('--refresh-telemetry', action='store_true', help='Replay fresh synthetic Instru metrics')
    parser.add_argument('--pace-ms', type=int, default=800, help='Pause between writes (minimum 50 ms)')
    args = parser.parse_args()
    if not 50 <= args.pace_ms <= 5000:
        parser.error('--pace-ms must be between 50 and 5000')
    session = json.loads(args.session_file.read_text())
    session = session.get('data', session)
    token = session.get('token') or session.get('access_token') or session.get('accessToken')
    if not token:
        parser.error('The private session file has no token')
    suite = Suite(token, args.apply, args.refresh_telemetry, args.pace_ms)
    print(json.dumps({'org': ORG, 'project': PROJECT, 'synthetic': True, 'apply': args.apply}), flush=True)
    failed = False
    for app in dict.fromkeys(args.apps):
        try:
            result = suite.office(app) if app in ('folio', 'grid', 'prism') else getattr(suite, app)()
        except (RuntimeError, ValueError, KeyError, TypeError) as exc:
            failed = True
            result = {'error': str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__}
        print(json.dumps({'app': app, **result}), flush=True)
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
