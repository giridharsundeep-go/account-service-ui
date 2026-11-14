#!/usr/bin/env python3
"""Repeatable INTERNAL synthetic Relay/Post load data. Dry run unless --apply.

Uses service DB credentials from private Spring property files, never CLI passwords.
Historical imports intentionally bypass mail delivery and notification outboxes.
Existing records are never deleted. Only organization 309 is supported.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlparse

MYSQL = Path('/opt/homebrew/opt/mysql-client/bin/mysql')
DATASET = 'gp309-load-v1'
OWNER = 79641
STREAMS = ['Checkout reliability', 'Sprint planning', 'API contracts', 'Release readiness',
           'Quality engineering', 'Customer onboarding', 'Accessibility', 'Incident review']
DISCUSSIONS = [
    ('Could you review the checkout retry acceptance criteria before planning?',
     'I have added the timeout and duplicate-request scenarios to the review checklist.',
     'Please keep the receipt identifier stable when a request is retried.',
     'Agreed. Let us capture the regression output and link the review evidence.'),
    ('What should we include in the next sprint review?',
     'Show the API contract, test coverage, and the remaining accessibility checks.',
     'I will prepare the demonstration notes; please review the risk section.',
     'The release remains planned until the team has reviewed the evidence.'),
    ('Can we clarify the incident reproduction steps?',
     'Record the request path, response status, environment, and affected release.',
     'Please exclude credentials and customer information from the sample logs.',
     'Thanks. We can compare the trace with the documented expected behavior.'),
]
LANGUAGES = [
    'नमस्ते टीम। कृपया समीक्षा के बाद परीक्षण परिणाम साझा करें।',
    'வணக்கம் குழுவினரே. சோதனை முடிவுகளை மதிப்பாய்வு செய்யலாம்.',
    'నమస్కారం బృందం. పరీక్ష ఫలితాలను సమీక్షిద్దాం.',
    '团队好，请在发布前检查测试结果和错误日志。',
    'チームの皆さん、リリース前にテスト結果を確認してください。',
    '안녕하세요. 배포 전에 테스트 결과를 함께 검토해 주세요.',
    'مرحباً بالفريق، يرجى مراجعة نتائج الاختبارات قبل الإصدار.',
    'שלום לצוות, נא לבדוק את תוצאות הבדיקות לפני השחרור.',
    'Bonjour, vérifions les résultats des tests avant la livraison.',
    'Hola equipo, revisemos las pruebas antes de publicar.',
    'Команда, проверим результаты тестирования перед выпуском.',
]
CODE = [
    '```java\npublic record Receipt(String id, long amount) {}\n```',
    '```rust\nfn ready(errors: usize) -> bool { errors == 0 }\n```',
    '```csharp\npublic record Release(string Version, bool Ready);\n```',
    '```python\ndef snapshot(receipt):\n    return dict(receipt)\n```',
    '```typescript\nconst ready = checks.every(check => check.passed);\n```',
    '```sql\nSELECT status, COUNT(*) FROM tickets GROUP BY status;\n```',
    '```kotlin\ndata class Review(val approved: Boolean)\n```',
    '```go\nfunc ready(errors int) bool { return errors == 0 }\n```',
]


def sql(value):
    """Hex literals avoid interpolation/escaping SQL and preserve Unicode exactly."""
    if value is None:
        return 'NULL'
    if isinstance(value, (int, float)):
        return str(value)
    return "CONVERT(X'%s' USING utf8mb4) COLLATE utf8mb4_unicode_ci" % str(value).encode('utf-8').hex()


def values(rows):
    return ',\n'.join('(' + ','.join(sql(v) for v in row) + ')' for row in rows)


def derived(rows, columns):
    return ' UNION ALL '.join('SELECT ' + ','.join(sql(value) + (' AS ' + columns[j] if i == 0 else '')
        for j, value in enumerate(row)) for i, row in enumerate(rows))


def key(prefix, sequence):
    return f'{prefix}-0000-4000-8000-{sequence:012x}'


def stamp(index, total):
    return (START + timedelta(seconds=int(index * 89 * 86400 / max(total, 1)))).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]


def properties(path):
    result = {}
    for line in path.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith(('#', '!')) and '=' in line:
            k, v = line.split('=', 1)
            result[k.strip()] = v.strip()
    return result


def run_mysql(config_name, source):
    config = properties(Path.home() / '.config/professy' / config_name)
    defaults_by_service = {
        'chatly-service.properties': ('jdbc:mysql://127.0.0.1:3306/chatly', 'chatly'),
        'mail.properties': ('jdbc:mysql://127.0.0.1:3306/greatley_mail', 'greatley_mail'),
    }
    url, user = defaults_by_service[config_name]
    config.setdefault('spring.datasource.url', url)
    config.setdefault('spring.datasource.username', user)
    address = urlparse(config['spring.datasource.url'].removeprefix('jdbc:'))
    database = address.path.strip('/')
    if address.hostname not in ('localhost', '127.0.0.1') or not re.fullmatch(r'[a-zA-Z0-9_]+', database):
        raise ValueError('Only the configured local service database can be seeded')
    def option(text):
        return '"' + text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'
    with tempfile.TemporaryDirectory(prefix='gp309-mysql-') as directory:
        defaults = Path(directory) / 'client.cnf'
        defaults.write_text('[client]\nuser=' + option(config['spring.datasource.username']) +
                            '\npassword=' + option(config['spring.datasource.password']) + '\n')
        defaults.chmod(0o600)
        with source.open('rb') as data:
            result = subprocess.run([str(MYSQL), '--defaults-extra-file=' + str(defaults),
                '--host=' + address.hostname, '--port=' + str(address.port or 3306),
                '--protocol=TCP', '--default-character-set=utf8mb4', '--batch', '--skip-column-names', database],
                stdin=data, capture_output=True, timeout=600)
        if result.returncode:
            # The SQL may contain user metadata. Do not echo statements or credentials.
            codes = re.findall(rb'ERROR \d+ \([A-Z0-9]+\)', result.stderr)
            raise RuntimeError('Database import failed: ' + (codes[0].decode() if codes else 'see local database configuration'))
        return result.stdout.decode().strip()


def chat_script(path, people, count):
    other = [p for p in people if int(p['id']) != OWNER]
    groups = min(1000, max(1, count // 100))
    with path.open('w') as f:
        f.write("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci; SET time_zone='+00:00';\n")
        for start in range(0, groups, 250):
            rows = [(309, 'GROUP', f'[LOADTEST] {STREAMS[i % len(STREAMS)]} · {i + 1:04}',
                     f'{DATASET}:{i}', OWNER, stamp(i, groups), stamp(i, groups))
                    for i in range(start, min(groups, start + 250))]
            f.write('INSERT IGNORE INTO conversations(org_id,kind,title,dm_key,created_by,created_at,updated_at) VALUES\n' + values(rows) + ';\n')
        rows = []
        for i in range(groups):
            ids = {OWNER, *[int(other[(i * 3 + n) % len(other)]['id']) for n in range(4)]}
            rows.extend((f'{DATASET}:{i}', uid) for uid in ids)
        for start in range(0, len(rows), 500):
            f.write("INSERT IGNORE INTO members(conversation_id,user_id,role,last_read_id) SELECT c.id,f.uid,IF(f.uid=79641,'OWNER','MEMBER'),0 FROM (" + derived(rows[start:start+500], ['k','uid']) + ") f JOIN conversations c ON c.org_id=309 AND c.dm_key=f.k;\n")
        for start in range(0, count, 500):
            rows = []
            for i in range(start, min(count, start+500)):
                group = 0 if i < min(1000, count) else 1 + (i - 1000) % max(1, groups - 1)
                group = min(group, groups-1)
                person = [OWNER] + [int(other[(group * 3 + n) % len(other)]['id']) for n in range(4)]
                body = '[SYNTHETIC LOAD TEST] ' + DISCUSSIONS[group % len(DISCUSSIONS)][i % 4]
                if i % 13 == 0:
                    body += '\n' + LANGUAGES[(i // 13) % len(LANGUAGES)]
                if i % 17 == 0:
                    body += '\n' + CODE[(i // 17) % len(CODE)]
                rows.append((f'{DATASET}:{group}', person[i % len(person)], key('309c0001', i+1), body, stamp(i, count)))
            f.write('START TRANSACTION;\nINSERT IGNORE INTO messages(conversation_id,author_id,client_id,body,created_at) SELECT c.id,f.author,f.client,f.body,f.ts FROM (' + derived(rows,['k','author','client','body','ts']) + ') f JOIN conversations c ON c.org_id=309 AND c.dm_key=f.k;\nCOMMIT;\n')
        f.write("UPDATE conversations c JOIN (SELECT m.conversation_id,MAX(m.created_at) latest,MIN(m.created_at) earliest FROM messages m JOIN conversations c2 ON c2.id=m.conversation_id WHERE c2.org_id=309 AND c2.dm_key LIKE 'gp309-load-v1:%' GROUP BY m.conversation_id) t ON t.conversation_id=c.id SET c.updated_at=t.latest,c.created_at=t.earliest;\n")
        # Only initialize newly imported memberships. Never reset a user's later reads.
        f.write("UPDATE members m JOIN conversations c ON c.id=m.conversation_id JOIN (SELECT conversation_id,MAX(id) latest FROM messages GROUP BY conversation_id) t ON t.conversation_id=c.id SET m.last_read_id=t.latest WHERE c.org_id=309 AND c.dm_key LIKE 'gp309-load-v1:%' AND m.last_read_id=0;\n")
        f.write("SELECT 'conversations',COUNT(*) FROM conversations WHERE org_id=309 AND dm_key LIKE 'gp309-load-v1:%';\nSELECT 'messages',COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.org_id=309 AND m.client_id LIKE '309c0001-%';\n")


def mail_script(path, people, count):
    owner = next(p for p in people if int(p['id']) == OWNER)
    other = [p for p in people if int(p['id']) != OWNER]
    with path.open('w') as f:
        f.write("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci; SET time_zone='+00:00';\n")
        for start in range(0, count, 500):
            rows = []
            senders = {}
            for i in range(start, min(count, start+500)):
                sender = other[i % len(other)]
                senders[sender['id']] = sender
                body = '<p>[SYNTHETIC LOAD TEST — INTERNAL ONLY]</p><p>' + DISCUSSIONS[i % len(DISCUSSIONS)][i % 4] + '</p>'
                if i % 11 == 0:
                    body += '<p dir="auto">' + LANGUAGES[(i // 11) % len(LANGUAGES)] + '</p>'
                body += '<p>Workstream: ' + STREAMS[i % len(STREAMS)] + '. Generated scenario ' + str(i+1) + '; no delivery or completed work is implied.</p>'
                date = stamp(i, count)
                rows.append((309, sender['id'], sender['name'], '[LOADTEST] ' + STREAMS[i % len(STREAMS)] + ' — review ' + str(i+1),
                    body, json.dumps([OWNER]), 'SENT', key('309a0001', i+1), date, date, date))
            f.write('START TRANSACTION;\nINSERT IGNORE INTO mail_messages(org_id,sender_id,sender_name,subject,body,recipient_ids,status,client_key,created_at,updated_at,sent_at) VALUES ' + values(rows) + ';\n')
            bounds = "m.org_id=309 AND m.client_key BETWEEN '" + key('309a0001',start+1) + "' AND '" + key('309a0001',min(count,start+500)) + "'"
            f.write('INSERT IGNORE INTO mail_recipients(message_id,user_id,kind,folder,name,email,read_at) SELECT m.id,' + str(OWNER) + ",'TO','INBOX'," + sql(owner['name']) + ',' + sql(owner['email']) + ',IF(MOD(m.id,7)=0,NULL,m.sent_at) FROM mail_messages m WHERE ' + bounds + ';\n')
            email = 'CASE m.sender_id ' + ' '.join('WHEN ' + sql(uid) + ' THEN ' + sql(p['email']) for uid,p in senders.items()) + ' END'
            f.write("INSERT IGNORE INTO mail_recipients(message_id,user_id,kind,folder,name,email,read_at) SELECT m.id,m.sender_id,'SENDER','SENT',m.sender_name," + email + ',m.sent_at FROM mail_messages m WHERE ' + bounds + ';\nCOMMIT;\n')
        f.write("SELECT 'mails',COUNT(*) FROM mail_messages WHERE org_id=309 AND client_key LIKE '309a0001-%';\nSELECT 'mailbox_rows',COUNT(*) FROM mail_recipients r JOIN mail_messages m ON m.id=r.message_id WHERE m.org_id=309 AND m.client_key LIKE '309a0001-%';\n")


START = datetime(2026, 8, 12, tzinfo=timezone.utc)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--org', type=int, default=309, choices=[309])
    parser.add_argument('--messages', type=int, default=100000)
    parser.add_argument('--mails', type=int, default=100000)
    parser.add_argument('--directory', type=Path, default=Path('/private/tmp/org309-directory.json'))
    args = parser.parse_args()
    if not all(1 <= n <= 1000000 for n in (args.messages,args.mails)):
        parser.error('Counts must be between 1 and 1,000,000')
    people = json.loads(args.directory.read_text())['people']
    if len(people) < 5 or not any(int(p['id']) == OWNER for p in people):
        parser.error('Expected an authenticated org 309 directory including its administrator')
    if len({p['id'] for p in people}) != len(people):
        parser.error('Directory contains duplicate IDs')
    print(json.dumps({'dataset':DATASET,'org':309,'synthetic':True,'messages':args.messages,'mails':args.mails,'externalDelivery':False,'notificationBroadcast':False,'apply':args.apply}))
    if not args.apply:
        return
    with tempfile.TemporaryDirectory(prefix='gp309-fixtures-') as directory:
        chat = Path(directory)/'chat.sql';mail = Path(directory)/'mail.sql'
        chat_script(chat, people, args.messages)
        print('Relay: ' + run_mysql('chatly-service.properties', chat), flush=True)
        mail_script(mail, people, args.mails)
        print('Post: ' + run_mysql('mail.properties', mail), flush=True)


if __name__ == '__main__':
    main()
