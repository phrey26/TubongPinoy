"""Solve the app's basic registration check for isolated integration fixtures."""
import re
import time


def answer_signup_challenge(challenge):
    match = re.search(r'(\d+) ([+−]) (\d+)', challenge['question'])
    if not match:
        raise AssertionError('Unexpected registration question')
    a, operation, b = match.groups()
    # Human-facing minimum delay is validated on the server, not bypassed in tests.
    time.sleep(2.05)
    return {'challengeId': challenge['id'], 'challengeAnswer': str(int(a) + int(b) if operation == '+' else int(a) - int(b)),
            'website': ''}
