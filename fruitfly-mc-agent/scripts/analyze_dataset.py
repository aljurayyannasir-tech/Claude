#!/usr/bin/env python3
"""Summarize FruitFly's logged play sessions (data/episodes/*.jsonl).

This is an analysis/export utility, not a trainer: it reports what the
dataset currently contains (episode count, action distribution, reward
trends, death causes) and can export a cleaned state-action table for a
future imitation-learning or offline-RL training run. It does not itself
train any model -- turning this dataset into a trained policy is a
separate step that needs a real ML framework and meaningfully more logged
play than a first session produces (see the repo README's "Roadmap"
section for honest expectations on dataset size).

Usage:
    python3 scripts/analyze_dataset.py [--data-dir data/episodes] [--export training_data.jsonl]
"""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


def iter_records(data_dir: Path):
    for path in sorted(data_dir.glob('*.jsonl')):
        with path.open('r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield path.name, json.loads(line)
                except json.JSONDecodeError:
                    continue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', default='data/episodes', help='Directory of *.jsonl session logs')
    parser.add_argument('--export', default=None, help='Optional path to write a cleaned (state, action) JSONL for training')
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f'No dataset found at {data_dir} yet -- run the bot first (npm start) to generate logs.')
        return

    sessions = set()
    action_counts = Counter()
    reward_by_action = defaultdict(list)
    total_records = 0
    total_reward = 0.0
    export_rows = []

    for filename, rec in iter_records(data_dir):
        sessions.add(filename)
        total_records += 1
        action_type = (rec.get('action') or {}).get('type', 'UNKNOWN')
        action_counts[action_type] += 1
        reward = rec.get('reward', 0) or 0
        reward_by_action[action_type].append(reward)
        total_reward += reward
        if args.export:
            export_rows.append({'state': rec.get('state'), 'action': rec.get('action')})

    if total_records == 0:
        print(f'{data_dir} exists but contains no records yet.')
        return

    print(f'Sessions logged     : {len(sessions)}')
    print(f'Total decision ticks : {total_records}')
    print(f'Average reward/tick  : {total_reward / total_records:.4f}')
    print()
    print('Action distribution (count, avg reward):')
    for action, count in action_counts.most_common():
        rewards = reward_by_action[action]
        avg = sum(rewards) / len(rewards)
        print(f'  {action:<22} {count:>6}   avg reward {avg:+.3f}')

    if args.export:
        out_path = Path(args.export)
        with out_path.open('w', encoding='utf-8') as f:
            for row in export_rows:
                f.write(json.dumps(row) + '\n')
        print()
        print(f'Exported {len(export_rows)} (state, action) rows -> {out_path}')


if __name__ == '__main__':
    main()
