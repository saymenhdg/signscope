from __future__ import annotations

import argparse
from collections import Counter, deque

import cv2

from signlang.inference import load_checkpoint, predict_clip
from signlang.mediapipe_hands import MediaPipeHandTracker, draw_landmarks
from signlang.tracking import MotionHandTracker, TemplateHandTracker, crop_to_bbox


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run live sign-language translation from webcam or video.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--source", default="0", help="Camera index like 0 or a video file path")
    parser.add_argument("--device", default=None)
    parser.add_argument("--window-size", type=int, default=20)
    parser.add_argument(
        "--clip-selection",
        default="recent",
        choices=["recent", "uniform"],
        help="How to choose frames from the live buffer before running the model.",
    )
    parser.add_argument("--predict-every", type=int, default=4)
    parser.add_argument("--smoothing", type=int, default=4)
    parser.add_argument(
        "--release-votes",
        type=int,
        default=2,
        help="How many low-confidence prediction steps are required before a new gesture can be emitted.",
    )
    parser.add_argument("--threshold", type=float, default=0.35)
    parser.add_argument("--min-margin", type=float, default=0.08)
    parser.add_argument("--min-hand-score", type=float, default=0.3)
    parser.add_argument("--max-tokens", type=int, default=12)
    parser.add_argument("--max-frames", type=int, default=None, help="Optional cap for processed frames")
    parser.add_argument("--no-display", action="store_true", help="Disable the OpenCV preview window")
    parser.add_argument(
        "--tracking-mode",
        default="auto",
        choices=["auto", "off", "motion", "mediapipe"],
        help="Tracking mode for the model input crop. Manual tracking can still be started with the 's' key.",
    )
    parser.add_argument("--tracking-pad-scale", type=float, default=2.2)
    parser.add_argument("--max-num-hands", type=int, default=2)
    parser.add_argument("--mp-detection-confidence", type=float, default=0.45)
    parser.add_argument("--mp-presence-confidence", type=float, default=0.4)
    parser.add_argument("--mp-tracking-confidence", type=float, default=0.35)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model, labels, model_config, device = load_checkpoint(args.checkpoint, args.device)

    source = int(args.source) if str(args.source).isdigit() else args.source
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Failed to open source: {args.source}")

    frame_buffer: deque = deque(maxlen=max(args.window_size, model_config["num_frames"]))
    prediction_history: deque[str | None] = deque(maxlen=args.smoothing)
    translated_tokens: deque[str] = deque(maxlen=args.max_tokens)
    active_label: str | None = None
    idle_votes = 0
    current_label = "..."
    current_confidence = 0.0
    current_margin = 0.0
    frame_index = 0
    display_enabled = not args.no_display
    model_frame_size = model_config["image_size"]
    use_mediapipe = args.tracking_mode == "mediapipe" or args.tracking_mode == "auto"
    mediapipe_tracker = None
    if use_mediapipe:
        try:
            mediapipe_tracker = MediaPipeHandTracker(
                max_num_hands=args.max_num_hands,
                min_hand_detection_confidence=args.mp_detection_confidence,
                min_hand_presence_confidence=args.mp_presence_confidence,
                min_tracking_confidence=args.mp_tracking_confidence,
                pad_scale=args.tracking_pad_scale,
            )
        except Exception as exc:
            print(f"MediaPipe hand tracking unavailable: {exc}")

    auto_tracking_enabled = (
        args.tracking_mode == "motion"
        or (args.tracking_mode == "auto" and mediapipe_tracker is None and str(args.source).isdigit())
    )
    motion_tracker = MotionHandTracker(pad_scale=args.tracking_pad_scale) if auto_tracking_enabled else None
    template_tracker = TemplateHandTracker()
    tracking_text = "full-frame"
    tracking_bbox = None
    landmark_result = None

    while True:
        success, frame = capture.read()
        if not success:
            break

        model_frame = frame
        tracking_result = None
        landmark_result = None

        if template_tracker.active:
            tracking_result = template_tracker.update(frame)
        elif mediapipe_tracker is not None:
            landmark_result = mediapipe_tracker.update(frame)
            tracking_result = landmark_result
        elif motion_tracker is not None:
            tracking_result = motion_tracker.update(frame)

        if tracking_result and tracking_result.bbox is not None:
            tracking_bbox = tracking_result.bbox
            tracked_crop = crop_to_bbox(frame, tracking_result.bbox)
            model_frame = tracked_crop
            tracking_text = f"{tracking_result.mode} {tracking_result.score:.2f}"
        else:
            tracking_bbox = None
            tracking_text = "full-frame"

        model_frame = cv2.resize(
            model_frame,
            (model_frame_size, model_frame_size),
            interpolation=cv2.INTER_LINEAR,
        )
        frame_buffer.append(model_frame)
        frame_index += 1

        if len(frame_buffer) >= model_config["num_frames"] and frame_index % args.predict_every == 0:
            inference_frames = select_inference_frames(
                frame_buffer=frame_buffer,
                num_frames=model_config["num_frames"],
                clip_selection=args.clip_selection,
            )
            label, confidence, distribution = predict_clip(
                model=model,
                frames_bgr=inference_frames,
                labels=labels,
                model_config=model_config,
                device=device,
            )
            current_label = label
            current_confidence = confidence
            ranked = sorted(distribution.values(), reverse=True)
            runner_up = ranked[1] if len(ranked) > 1 else 0.0
            current_margin = confidence - runner_up
            tracking_ok = (
                landmark_result is None
                or landmark_result.score >= args.min_hand_score
                or template_tracker.active
            )
            is_accepted = (
                confidence >= args.threshold
                and current_margin >= args.min_margin
                and tracking_ok
            )
            prediction_history.append(label if is_accepted else None)

            stable_label = most_common_stable_label(prediction_history, args.smoothing)
            if stable_label is None:
                idle_votes += 1
                if active_label is not None and idle_votes >= args.release_votes:
                    active_label = None
                    prediction_history.clear()
            else:
                idle_votes = 0
                if active_label is None:
                    if not translated_tokens or translated_tokens[-1] != stable_label:
                        translated_tokens.append(stable_label)
                    active_label = stable_label
                    prediction_history.clear()

        overlay_frame(
            frame,
            current_label,
            current_confidence,
            current_margin,
            list(translated_tokens),
            tracking_bbox=tracking_bbox,
            tracking_text=tracking_text,
            display_enabled=display_enabled,
            landmark_result=landmark_result,
        )

        if display_enabled:
            try:
                cv2.imshow("Sign Language Translation", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
                if key == ord("c"):
                    translated_tokens.clear()
                if key == ord("r"):
                    template_tracker.reset()
                    if mediapipe_tracker is not None:
                        mediapipe_tracker.reset()
                    if motion_tracker is not None:
                        motion_tracker.reset()
                if key == ord("s"):
                    selection = cv2.selectROI("Sign Language Translation", frame, fromCenter=False, showCrosshair=True)
                    if selection[2] > 0 and selection[3] > 0:
                        template_tracker.initialize(frame, tuple(int(value) for value in selection))
            except cv2.error:
                display_enabled = False
                print("OpenCV window display is unavailable. Continuing without preview.")

        if args.max_frames is not None and frame_index >= args.max_frames:
            break

    capture.release()
    if display_enabled:
        cv2.destroyAllWindows()
    if mediapipe_tracker is not None:
        mediapipe_tracker.close()

    translation = " ".join(translated_tokens)
    print(f"Processed {frame_index} frames")
    print(f"Last prediction: {current_label} ({current_confidence:.2f})")
    print("Translation:", translation if translation else "<empty>")


def select_inference_frames(
    frame_buffer: deque,
    num_frames: int,
    clip_selection: str,
) -> list:
    buffered_frames = list(frame_buffer)
    if clip_selection == "uniform":
        return buffered_frames
    return buffered_frames[-num_frames:]


def most_common_stable_label(history: deque[str | None], minimum_votes: int) -> str | None:
    if len(history) < minimum_votes:
        return None
    counts = Counter(label for label in history if label is not None)
    if not counts:
        return None
    label, votes = counts.most_common(1)[0]
    return label if votes >= minimum_votes - 1 else None


def overlay_frame(
    frame,
    label: str,
    confidence: float,
    margin: float,
    translated_tokens: list[str],
    tracking_bbox=None,
    tracking_text: str = "full-frame",
    display_enabled: bool = True,
    landmark_result=None,
) -> None:
    text_color = (255, 255, 255)
    panel_color = (20, 20, 20)
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 130), panel_color, thickness=-1)
    cv2.putText(
        frame,
        f"Current: {label} ({confidence:.2f}, m={margin:.2f})",
        (20, 35),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        text_color,
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        "Translation: " + " ".join(translated_tokens),
        (20, 75),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        text_color,
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        f"Tracking: {tracking_text}",
        (20, 112),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        text_color,
        2,
        cv2.LINE_AA,
    )
    if display_enabled:
        cv2.putText(
            frame,
            "Keys: q quit | c clear | s select ROI | r reset tracker",
            (340, 112),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            text_color,
            1,
            cv2.LINE_AA,
        )

    if tracking_bbox is not None:
        x, y, width, height = tracking_bbox
        cv2.rectangle(frame, (x, y), (x + width, y + height), (40, 200, 40), 2)

    if landmark_result is not None:
        draw_landmarks(frame, landmark_result)


if __name__ == "__main__":
    main()
