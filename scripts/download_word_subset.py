from __future__ import annotations

import argparse
import csv
import random
import shutil
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import RemoteEntryNotFoundError
from tqdm import tqdm


# A curated starter vocabulary of common everyday ASL signs. The goal is to
# pick words that are visually distinctive (different handshapes, motion
# paths, and hand counts) so the first model has a fighting chance at >70%.
DEFAULT_WORDS: tuple[str, ...] = (
    "HELLO",
    "THANK YOU",
    "YES",
    "NO",
    "PLEASE",
    "SORRY",
    "GOOD",
    "BAD",
    "LOVE",
    "HELP",
    "MORE",
    "FINISHED",
    "NAME",
    "FRIEND",
    "WATER",
    "FOOD",
    "HOME",
    "SCHOOL",
    "WORK",
    "HAPPY",
    "SAD",
    "WANT",
    "NEED",
    "UNDERSTAND",
    "LEARN",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a word-level ASL subset from a Hugging Face dataset repo."
    )
    parser.add_argument("--repo-id", default="akasheroor/American-Sign-Language-Dataset")
    parser.add_argument(
        "--repo-file",
        default=None,
        help="CSV manifest inside the dataset repo. If omitted, the script auto-detects a top-level CSV file.",
    )
    parser.add_argument("--output-dir", default="data/word_raw_v1")
    parser.add_argument("--cache-dir", default=".cache/huggingface")
    parser.add_argument("--max-per-word", type=int, default=40)
    parser.add_argument(
        "--row-offset",
        type=int,
        default=0,
        help="Skip the first N shuffled rows per word. Use this to add more clips beyond an earlier pack without re-downloading duplicates.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--part-prefixes", nargs="*", default=[f"part_{index}" for index in range(1, 12)])
    parser.add_argument(
        "--words",
        nargs="+",
        default=None,
        help="Override the default word list. Use 'DEFAULT' to explicitly use the curated starter set.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = resolve_manifest_path(args.repo_id, args.repo_file)
    csv_path = hf_hub_download(
        repo_id=args.repo_id,
        filename=manifest_path,
        repo_type="dataset",
        cache_dir=args.cache_dir,
    )

    requested_words = _resolve_word_list(args.words)
    rows_by_word: dict[str, list[dict[str, str]]] = {word: [] for word in requested_words}

    with Path(csv_path).open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            word = row["word"].upper().strip()
            if word in rows_by_word:
                rows_by_word[word].append(row)

    randomizer = random.Random(args.seed)
    copied = 0
    missing_words: list[str] = []

    for word in sorted(requested_words):
        rows = rows_by_word.get(word, [])
        if not rows:
            missing_words.append(word)
            print(f"Skipping {word}: no entries found in manifest")
            continue

        randomizer.shuffle(rows)
        # Sanitize the directory name — spaces become underscores so the
        # folder layout plays nicely with file-system-driven dataset loaders.
        folder_name = word.replace(" ", "_")
        word_dir = output_dir / folder_name
        word_dir.mkdir(parents=True, exist_ok=True)

        # Slot-based naming: row index N maps deterministically to file
        # ``f"{N+1:04d}.<ext>"``. This makes the download idempotent — a
        # re-run with a higher ``--max-per-word`` only fills in missing slots
        # instead of re-downloading rows 0..39 as fresh 0041-0060 (a bug in
        # the original count-based naming).
        new_for_word = 0
        existing_slots = 0
        for row_idx, row in enumerate(tqdm(rows, desc=f"Downloading {word}", leave=False)):
            slot_num = row_idx + 1
            if slot_num <= args.row_offset:
                continue
            if slot_num > args.max_per_word:
                break
            existing = list(word_dir.glob(f"{slot_num:04d}.*"))
            if existing:
                existing_slots += 1
                continue
            try:
                relative_path = resolve_video_path(args.repo_id, row, args.part_prefixes)
                downloaded_path = hf_hub_download(
                    repo_id=args.repo_id,
                    filename=relative_path,
                    repo_type="dataset",
                    cache_dir=args.cache_dir,
                )
            except Exception as exc:
                print(f"Skipping {word} sample {row.get('videos', '<unknown>')}: {exc}")
                continue

            destination = word_dir / f"{slot_num:04d}{Path(relative_path).suffix.lower()}"
            shutil.copy2(downloaded_path, destination)
            new_for_word += 1
            copied += 1

        total_for_word = existing_slots + new_for_word
        print(f"{word}: {new_for_word} new, {existing_slots} already present (total {total_for_word}) in {word_dir}")

    print(f"Finished. Downloaded {copied} video clips into {output_dir.resolve()}")
    if missing_words:
        print(
            "The following words had no entries in the manifest and were skipped: "
            + ", ".join(missing_words)
        )


def _resolve_word_list(words: list[str] | None) -> set[str]:
    if not words or (len(words) == 1 and words[0].upper() == "DEFAULT"):
        return {word.upper() for word in DEFAULT_WORDS}
    return {word.upper().strip() for word in words}


def resolve_manifest_path(repo_id: str, repo_file: str | None) -> str:
    if repo_file:
        return repo_file

    api = HfApi()
    top_level_items = api.list_repo_tree(repo_id, repo_type="dataset", recursive=False)
    csv_files = sorted(item.path for item in top_level_items if item.path.lower().endswith(".csv"))
    if not csv_files:
        raise RuntimeError(f"No CSV manifest found in dataset repo {repo_id}")
    return csv_files[0]


def resolve_video_path(repo_id: str, row: dict[str, str], part_prefixes: list[str]) -> str:
    if "video_path" in row and row["video_path"]:
        return row["video_path"]

    filename = row.get("videos")
    if not filename:
        raise RuntimeError("Manifest row is missing both 'video_path' and 'videos' columns")

    if "/" in filename or "\\" in filename:
        return filename.replace("\\", "/")

    for prefix in part_prefixes:
        candidate = f"{prefix}/{filename}"
        try:
            hf_hub_download(repo_id=repo_id, filename=candidate, repo_type="dataset", dry_run=True)
            return candidate
        except RemoteEntryNotFoundError:
            continue

    raise RuntimeError(f"Could not resolve video path for {filename}")


if __name__ == "__main__":
    main()
