from __future__ import annotations

import argparse
import csv
import random
import shutil
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import RemoteEntryNotFoundError
from tqdm import tqdm


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download a small ASL subset from a Hugging Face dataset repo.")
    parser.add_argument("--repo-id", default="akasheroor/American-Sign-Language-Dataset")
    parser.add_argument(
        "--repo-file",
        default=None,
        help="CSV manifest inside the dataset repo. If omitted, the script auto-detects a top-level CSV file.",
    )
    parser.add_argument("--output-dir", default="data/raw")
    parser.add_argument("--cache-dir", default=".cache/huggingface")
    parser.add_argument("--max-per-word", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--part-prefixes", nargs="*", default=[f"part_{index}" for index in range(1, 12)])
    parser.add_argument(
        "--words",
        nargs="+",
        required=True,
        help="Words to download, for example HELLO YES NO",
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

    requested_words = {word.upper() for word in args.words}
    rows_by_word: dict[str, list[dict[str, str]]] = {word: [] for word in requested_words}

    with Path(csv_path).open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            word = row["word"].upper()
            if word in rows_by_word:
                rows_by_word[word].append(row)

    randomizer = random.Random(args.seed)
    copied = 0

    for word in sorted(requested_words):
        rows = rows_by_word.get(word, [])
        if not rows:
            print(f"Skipping {word}: no entries found in manifest")
            continue

        randomizer.shuffle(rows)
        word_dir = output_dir / word
        word_dir.mkdir(parents=True, exist_ok=True)
        existing_files = sorted(path for path in word_dir.iterdir() if path.is_file())
        downloaded_for_word = len(existing_files)
        if downloaded_for_word >= args.max_per_word:
            print(f"{word}: already has {downloaded_for_word} clips in {word_dir}")
            continue

        for row in tqdm(rows, desc=f"Downloading {word}", leave=False):
            if downloaded_for_word >= args.max_per_word:
                break
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

            destination = word_dir / f"{downloaded_for_word + 1:04d}{Path(relative_path).suffix.lower()}"
            shutil.copy2(downloaded_path, destination)
            downloaded_for_word += 1
            copied += 1

        print(f"{word}: downloaded {downloaded_for_word} clips to {word_dir}")

    print(f"Finished. Downloaded {copied} video clips into {output_dir.resolve()}")


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
