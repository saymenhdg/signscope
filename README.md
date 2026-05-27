# Sign Language Recognition, Alphabet Practice, and Live Translation

This project includes:

- a PyTorch word-level sign recognizer for live webcam or video translation
- a separate alphabet practice stack with a FastAPI backend and a React learning UI

The implementation uses:

- A lightweight `MobileNetV3 + BiGRU + attention` model
- A separate PyTorch alphabet landmark classifier, with the image classifier kept as a fallback
- Raw RGB video clips for recognition, with MediaPipe hand landmarks for advanced tracking
- MediaPipe Hand Landmarker for 21-point hand tracking and landmark overlays
- A Hugging Face subset downloader for quick experiments
- A live inference app that smooths predictions into readable text
- A `FastAPI + React` alphabet learning platform

## What "translation" means here

This repository performs isolated sign recognition and renders the recognized sign labels as text in real time. That is practical for webcam use and trainable on smaller datasets. Full continuous sign-to-sentence translation is a different problem that needs sentence-aligned corpora and a much larger sequence-to-sequence model.

## Project layout

```text
signlang/
  alphabet_data.py
  alphabet_inference.py
  alphabet_model.py
  alphabet_transforms.py
  data.py
  inference.py
  model.py
  transforms.py
  utils.py
api/
  main.py
web/
  src/
scripts/
  download_hf_subset.py
  extract_alphabet_frames.py
  preprocess_mediapipe_crops.py
train_alphabet.py
evaluate_alphabet.py
train.py
evaluate.py
realtime.py
```

## Environment

The current machine already has a usable Python 3.13 + PyTorch stack. Install the remaining dependencies with:

```powershell
py -3.13 -m pip install -r requirements.txt
```

## Alphabet Practice Platform

The source alphabet data is stored as short labeled videos. The current live alphabet backend is landmark-first: it uses MediaPipe hand landmarks and a PyTorch landmark classifier for webcam prediction, then falls back to the older image model only when a stable hand landmark set is not available.

### 1. Download the alphabet dataset

```powershell
py -3.13 scripts\download_hf_subset.py `
  --repo-id akasheroor/American-Sign-Language-Dataset `
  --output-dir data\alphabet_raw_v1 `
  --words A B C D E F G H I J K L M N O P Q R S T U V W X Y Z `
  --max-per-word 20
```

### 2. Extract alphabet landmarks for the live model

```powershell
py -3.13 scripts\extract_alphabet_landmarks.py `
  --input-dir data\alphabet_raw_v1 `
  --output-path data\alphabet_landmarks_v2\records.json `
  --frames-per-video 12
```

### 3. Train the landmark alphabet classifier

```powershell
py -3.13 train_alphabet_landmarks.py `
  --data-path data\alphabet_landmarks_v2\records.json `
  --artifact-dir artifacts\alphabet_landmarks_v2 `
  --epochs 50 `
  --batch-size 128 `
  --workers 0 `
  --hidden-dim 384 `
  --dropout 0.3 `
  --patience 10 `
  --lr 0.001
```

### 4. Evaluate the landmark alphabet classifier

```powershell
py -3.13 evaluate_alphabet_landmarks.py `
  --checkpoint artifacts\alphabet_landmarks_v2\best.pt `
  --data-path data\alphabet_landmarks_v2\records.json
```

Current tuned live setup:

- backend landmark ensemble: `artifacts/alphabet_landmarks_v2/best.pt` + `artifacts/alphabet_landmarks_v3/best.pt`
- best single landmark checkpoint: `artifacts/alphabet_landmarks_v2/best.pt`
- single-model held-out test accuracy: about `0.74`
- two-model landmark ensemble held-out test accuracy: about `0.775`
- weaker letters are still visually similar handshapes and motion letters like `J` and `Z`

### 5. Run the FastAPI backend

```powershell
py -3.13 -m uvicorn api.main:app --reload
```

### Admin login on PostgreSQL

The app already supports PostgreSQL through `DATABASE_URL`. To create an admin account in the configured Postgres database:

```powershell
py -3.13 scripts\create_admin.py `
  --email admin@signspeak.local `
  --password "change-this-password" `
  --display-name "SignSpeak Admin" `
  --verified
```

Then sign in at:

```text
http://localhost:5173/admin/login
```

### 6. Run the React learning UI

```powershell
cd web
npm install
npm run dev
```

If your API is not on the default address, set:

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8000"
```

before starting the frontend.

The learning UI lets the user:

- activate the webcam
- pick or randomize a target letter
- get continuous live alphabet prediction from the backend
- see the predicted letter, confidence, top guesses, and a tracked hand overlay
- track practice score during the session

Important limitation:

- `J` and `Z` are motion letters, so single-frame validation is weaker for those two

## 1. Download a small ASL subset

This pulls a small word-level dataset into `data/raw/<WORD>/*.mp4`.

```powershell
py -3.13 scripts\download_hf_subset.py `
  --repo-id akasheroor/American-Sign-Language-Dataset `
  --output-dir data\raw `
  --words HELLO YES NO PLEASE `
  --max-per-word 24
```

## 2. Train the recognizer

```powershell
py -3.13 train.py `
  --data-dir data\raw `
  --artifact-dir artifacts\asl_small `
  --epochs 10 `
  --batch-size 8 `
  --num-frames 16 `
  --image-size 160 `
  --trainable-backbone-blocks 2
```

Outputs include:

- `artifacts/asl_small/best.pt`
- `artifacts/asl_small/metrics.json`
- `artifacts/asl_small/classification_report.txt`

## 2b. Recommended: preprocess MediaPipe hand crops first

This matches training data to the advanced landmark-based webcam pipeline.

```powershell
py -3.13 scripts\preprocess_mediapipe_crops.py `
  --input-dir data\core_words `
  --output-dir data\core_words_mp `
  --classes HELP I NEED NO PLEASE WANT YES `
  --output-size 256
```

Then train on the cropped dataset:

```powershell
py -3.13 train.py `
  --data-dir data\core_words_mp `
  --artifact-dir artifacts\core_words_45_mp_v1 `
  --epochs 20 `
  --batch-size 8 `
  --num-frames 16 `
  --image-size 128 `
  --trainable-backbone-blocks 2 `
  --dropout 0.4 `
  --hidden-size 192
```

## 3. Evaluate on the held-out test split

```powershell
py -3.13 evaluate.py `
  --checkpoint artifacts\asl_small\best.pt `
  --data-dir data\raw
```

## 4. Run live translation from webcam

```powershell
py -3.13 realtime.py `
  --checkpoint artifacts\core_words_45_mp_v1\best.pt `
  --source 0 `
  --tracking-mode mediapipe `
  --threshold 0.35 `
  --min-margin 0.08 `
  --smoothing 4 `
  --release-votes 2
```

Press `q` to quit.
Press `c` to clear the accumulated translated text.
Press `s` to draw a manual ROI around your hands if you want to override the automatic tracker.
Press `r` to reset the tracker.

For terminal-only testing without opening a preview window:

```powershell
py -3.13 realtime.py `
  --checkpoint artifacts\core_words_45_mp_v1\best.pt `
  --source path\to\video.mp4 `
  --tracking-mode mediapipe `
  --threshold 0.35 `
  --min-margin 0.08 `
  --smoothing 4 `
  --release-votes 2 `
  --no-display
```

Tracking modes:

- `--tracking-mode auto`: uses MediaPipe hand landmarks when available and falls back to simpler tracking when needed
- `--tracking-mode mediapipe`: forces 21-point MediaPipe hand landmarks and skeleton drawing
- `--tracking-mode motion`: always uses the automatic motion tracker
- `--tracking-mode off`: disables automatic tracking, but manual `s` selection still works in the preview window

## 5. Run translation from a video file

```powershell
py -3.13 realtime.py `
  --checkpoint artifacts\core_words_45_mp_v1\best.pt `
  --source path\to\video.mp4
```

## Available trained checkpoints

- `artifacts/alphabet_landmarks_v2/best.pt`: best single alphabet landmark checkpoint
- `artifacts/alphabet_landmarks_v3/best.pt`: complementary alphabet landmark checkpoint used with `v2` in the live backend ensemble
- `artifacts/alphabet_frames_v1/best.pt`: older image-based alphabet fallback checkpoint
- `artifacts/smoke/best.pt`: 4-word smoke-test model
- `artifacts/core_words_45_mp_v1/best.pt`: recommended PyTorch MediaPipe-cropped 7-word model trained on 45 clips per word with `HELP I NEED NO PLEASE WANT YES`
- `artifacts/core_words_v1/best.pt`: older full-frame 8-word model with `HELP I NEED NO PLEASE WANT YES YOU`
- `artifacts/core_words_mp_v1/best.pt`: earlier smaller MediaPipe-cropped 7-word model
- `artifacts/sentence_words_v1/best.pt`: larger 12-word experiment, currently weaker than `core_words_v1`

If you want to continue a training run instead of restarting it, use:

```powershell
py -3.13 train.py `
  --data-dir data\core_words `
  --artifact-dir artifacts\core_words_v1 `
  --resume artifacts\core_words_v1\best.pt
```

## Tips for better accuracy

- Use at least 50 to 100 clips per word.
- Keep the signer centered with clear hands.
- Train on 10 to 30 words before expanding further.
- Increase `--epochs` to 20 or more once the dataset is large enough.
- Unfreeze more backbone blocks with `--trainable-backbone-blocks 3` or `4` for larger datasets.

## Custom dataset format

The training code expects:

```text
data/raw/
  HELLO/
    sample_001.mp4
    sample_002.mp4
  THANKS/
    sample_001.mp4
```

Each folder name becomes the class label.
