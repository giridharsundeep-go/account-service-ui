#!/usr/bin/env python3
"""Finite, paced synthetic traffic through real local APIs. Dry run by default."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session-file', type=Path, required=True,
                        help='Private JSON containing an authenticated user token; never commit it')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--count', type=int, default=10, help='Number of chat messages (1–1,000)')
    parser.add_argument('--interval-ms', type=int, default=1000, help='Pause between messages; minimum 250 ms')
    parser.add_argument('--mail-every', type=int, default=5, help='Also send one internal mail every N messages; 0 disables mail')
    parser.add_argument('--recipient', type=int, default=0, help='Org 309 human user ID; default is your own account')
    parser.add_argument('--conversation', type=int, default=0,
                        help='Existing labelled test conversation; default creates a private test group')
    args = parser.parse_args()
    if not 1 <= args.count <= 1000 or args.interval_ms < 250 or not 0 <= args.mail_every <= 1000:
        parser.error('Use count 1–1,000, interval >=250 ms, and mail-every 0–1,000')
    if args.conversation < 0 or args.recipient < 0:
        parser.error('IDs must be positive')
    session = json.loads(args.session_file.read_text())
    session = session.get('data', session)
    token = session.get('token') or session.get('access_token') or session.get('accessToken')
    if not isinstance(token, str) or not token.strip():
        parser.error('The private session file has no token')

    def request(port, path, method='GET', body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, method=method,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            # Do not echo credentials, submitted bodies or response metadata.
            raise RuntimeError(f'{method} {port}{path}: HTTP {error.code}; replay stopped') from None

    access = request(8080, '/api/session/access')
    actor = access['user']
    if int(actor['orgId']) != 309:
        parser.error('Replay is restricted to organization 309')
    owner = int(actor['id'])
    recipient = args.recipient or owner
    directory = request(8080, '/api/session/directory')
    humans = {int(person['id']) for person in directory['people'] if int(person['id']) > 0}
    if recipient not in humans:
        parser.error('Recipient must be an active human in your org 309 directory')
    if args.conversation:
        conversation = request(8084, '/api/conversations/' + str(args.conversation))
        if not str(conversation.get('title', '')).startswith('[LOADTEST'):
            parser.error('Use a conversation labelled [LOADTEST]')
    print(json.dumps({'org': 309, 'synthetic': True, 'authorId': owner, 'recipientId': recipient,
        'chatMessages': args.count, 'internalMails': args.count // args.mail_every if args.mail_every else 0,
        'intervalMs': args.interval_ms, 'apply': args.apply}))
    if not args.apply:
        return
    run = str(uuid.uuid4())
    conversation_id = args.conversation
    if not conversation_id:
        conversation_id = request(8084, '/api/conversations', 'POST', {'kind': 'GROUP',
            'title': '[LOADTEST LIVE] ' + run[:8], 'members': [] if recipient == owner else [recipient]})['id']
    started = time.monotonic()
    for index in range(1, args.count + 1):
        message = ('[SYNTHETIC LIVE TEST] ' + run[:8] + f' · event {index}\n'
            + datetime.now(timezone.utc).isoformat() + '\n'
            + ['Please review the regression evidence. No delivery is implied.',
               'నమస్కారం · नमस्ते · தமிழ் · 中文 · العربية · עברית',
               '```rust\nfn ready(errors: usize) -> bool { errors == 0 }\n```'][index % 3])
        row = request(8084, f'/api/conversations/{conversation_id}/messages', 'POST',
            {'body': message, 'clientId': str(uuid.uuid5(uuid.UUID(run), str(index))),
             'attachments': [], 'documents': []})
        result = {'sequence': index, 'conversationId': conversation_id, 'messageId': row['id']}
        if args.mail_every and index % args.mail_every == 0:
            draft = request(8095, '/api/mail/drafts', 'POST')
            body = {'subject': f'[LOADTEST LIVE] Review update {run[:8]} · {index}',
                'body': '<p>[SYNTHETIC LIVE TEST]</p><p>Review the linked conversation and regression evidence. '
                        'This is test traffic, not completed customer work.</p>',
                'recipientIds': [recipient], 'ccRecipientIds': [], 'bccRecipientIds': []}
            sent = request(8095, f'/api/mail/drafts/{draft["id"]}/send', 'POST', body)
            result['mailId'] = sent['id']
        print(json.dumps(result), flush=True)
        if index < args.count:
            time.sleep(args.interval_ms / 1000)
    print(json.dumps({'complete': True, 'run': run, 'elapsedSeconds': round(time.monotonic() - started, 2)}))


if __name__ == '__main__':
    main()
