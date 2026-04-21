from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WordCheckpointMetadata:
    labels: list[str]


def load_word_checkpoint_metadata(checkpoint_path: str | Path) -> WordCheckpointMetadata:
    checkpoint_dir = Path(checkpoint_path).parent
    metrics_path = checkpoint_dir / "metrics.json"
    if not metrics_path.exists():
        return WordCheckpointMetadata(labels=[])

    try:
        payload = json.loads(metrics_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return WordCheckpointMetadata(labels=[])

    raw_labels = payload.get("labels", []) if isinstance(payload, dict) else []
    labels: list[str] = []
    seen: set[str] = set()
    for raw_label in raw_labels:
        label = str(raw_label).upper()
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return WordCheckpointMetadata(labels=labels)
