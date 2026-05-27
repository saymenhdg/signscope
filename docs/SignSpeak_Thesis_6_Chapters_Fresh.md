# SignSpeak: A Multi-Module Sign Language Learning and Recognition Platform

## Fresh Thesis Draft Notice
This document was written directly from the current repository implementation, configuration, training scripts, frontend pages, backend services, and local experiment artifacts. It does not reuse the older thesis files already present in `docs/`.

## Abstract
SignSpeak is a full-stack sign language learning and recognition platform that combines machine learning, interactive web delivery, live camera-based feedback, progress analytics, and teacher-student coordination features in one system. The project addresses two related but distinct problems. The first problem is isolated American Sign Language recognition for alphabet letters and core vocabulary words. The second problem is practical guided learning, where users need structured lessons, live feedback, repetition tracking, and role-based educational workflows rather than a standalone classifier. To solve these problems, the project uses a FastAPI backend, a React and Vite frontend, SQLAlchemy-based persistence, MediaPipe-based landmark extraction, and PyTorch recognition models. The alphabet subsystem is landmark-first, with an image model retained as a fallback. The word subsystem uses server-side MediaPipe extraction of hand and pose landmarks followed by a temporal sequence classifier. The current implementation also includes authentication, analytics, role separation for students, teachers, and administrators, lesson booking, messaging, and progress dashboards. Local training artifacts indicate that the current alphabet landmark checkpoint substantially outperforms the older image-based alphabet model, while the current word landmark model reaches strong held-out performance across a broader vocabulary. This thesis documents the system end to end, including problem framing, architecture, dataset pipeline, model design, application implementation, evaluation, limitations, and future directions.

## Chapter 1. Introduction

### 1.1 Background
Sign language technology has often been discussed as a recognition problem only, but real educational use requires more than a classifier. Learners need guided practice, reference materials, feedback loops, repetition tracking, and an interface that turns predictions into usable coaching. SignSpeak is built around that broader view. It is not only an experiment in sign classification; it is an educational platform that operationalizes machine learning in a user-facing environment.

The repository shows two main recognition tracks:

1. Alphabet recognition, intended for live practice of letters A through Z.
2. Word recognition, intended for short isolated ASL vocabulary items such as `HELLO`, `HELP`, `PLEASE`, `YES`, `NO`, and a much larger trained word set in later checkpoints.

The platform also separates learning from direct inference. A user can study reference examples first, then move into live camera practice, receive confidence-based feedback, and have attempts recorded for later analytics. This combination is important because sign learning depends on incremental correction, not just final label output.

### 1.2 Problem Statement
The project addresses the following practical problem:

How can a single system support sign language self-practice, live sign recognition, progress tracking, and educational coordination while remaining deployable on a local development stack and trainable from modest datasets?

This broad problem can be decomposed into six subproblems:

1. Capturing visual sign input from a camera or recorded video.
2. Extracting stable hand and upper-body features despite motion and detection noise.
3. Classifying either single-hand alphabet gestures or short word-level sign sequences.
4. Converting raw predictions into usable feedback with confidence gating.
5. Delivering the learning flow through a web application with structured lessons.
6. Persisting performance data so progress, weak areas, and engagement can be analyzed over time.

### 1.3 Objectives
Based on the actual codebase, the project objectives can be stated as follows:

1. Build a live alphabet recognizer suitable for browser-based practice.
2. Build a word-level recognizer that operates on short temporal sequences.
3. Use MediaPipe landmarks to reduce dependence on background appearance and improve robustness.
4. Provide lesson content and guided practice flows through a React frontend.
5. Record learning attempts and sessions for dashboard and progress analytics.
6. Support different user roles, including students, teachers, and administrators.
7. Keep the backend extensible through service and repository boundaries rather than monolithic route logic.

### 1.4 Scope
The implementation is intentionally scoped to isolated sign recognition rather than full continuous sign-to-sentence translation. The repository README explicitly distinguishes these tasks. The system recognizes isolated letters or isolated word signs and renders the recognized label as text or lesson feedback. It does not perform continuous linguistic parsing, grammar reconstruction, gloss alignment, or end-to-end sentence translation.

The scope also favors practical deployment over research-only experimentation. The repository includes:

1. Training scripts.
2. Evaluation scripts.
3. Real-time desktop inference.
4. API inference endpoints.
5. Web-based learning pages.
6. Authentication and analytics infrastructure.

### 1.5 Significance of the Project
The significance of SignSpeak is that it closes the gap between a machine learning prototype and a usable learning product. Many sign recognition projects stop at model accuracy tables. This project instead embeds recognition inside a learner workflow:

1. Study the sign.
2. Practice in front of the camera.
3. Receive feedback.
4. Save attempts.
5. Review progress and weak areas.

This is a stronger contribution for educational software engineering because it demonstrates the full lifecycle from data preparation to end-user interaction.

### 1.6 Thesis Organization
This thesis is organized into six chapters:

1. Introduction.
2. System analysis and requirements.
3. Architecture and design.
4. Data pipeline and machine learning methodology.
5. Implementation, results, and discussion.
6. Conclusion and future work.

## Chapter 2. System Analysis and Requirements

### 2.1 Repository-Level Understanding
The repository is divided into four major technical zones:

1. `signlang/` for machine learning models, datasets, transforms, and inference helpers.
2. `api/` for the FastAPI backend, services, routers, repositories, schemas, and database logic.
3. `web/` for the React frontend and learning interface.
4. `scripts/` for dataset download, preprocessing, landmark extraction, and utility tooling.

This structure reflects a deliberate separation between model research code and application runtime code. The project is not a simple notebook-based prototype. It has clearly evolved into a modular application stack.

### 2.2 Functional Requirements
From the source code, the system supports the following functional requirements.

#### 2.2.1 Authentication and User Management
The system allows:

1. User registration.
2. User login.
3. Password reset token generation and password update.
4. Session-based authentication via cookies.
5. Optional OAuth provider login through Google and GitHub when configured.
6. Profile update and avatar upload.

#### 2.2.2 Learning Features
The learning subsystem provides:

1. Alphabet lesson retrieval through `/api/learn/alphabet`.
2. Word lesson retrieval through `/api/learn/words`.
3. Reference image and reference video serving for alphabet content.
4. Reference video serving for word content.
5. Session and attempt recording for analytics.

#### 2.2.3 Recognition Features
The inference subsystem provides:

1. Alphabet health and readiness reporting.
2. Alphabet prediction from a single captured image.
3. Alphabet validation against a target letter.
4. Word vocabulary discovery.
5. Word prediction from normalized feature sequences.
6. Word prediction directly from captured image frames, with server-side landmark extraction.

#### 2.2.4 Analytics and Progress
The system stores and derives:

1. Learning sessions.
2. Per-attempt prediction results.
3. Dashboard summaries.
4. Practice streaks.
5. Heatmaps.
6. Weak areas.
7. Achievements.
8. Track breakdown between alphabet and words.

#### 2.2.5 Teacher and Admin Features
The project extends beyond self-practice by supporting:

1. Teacher profile setup.
2. Public teacher directory.
3. Lesson booking.
4. Teacher-student message threads.
5. Teacher notifications.
6. Admin overview dashboards.
7. Admin user and teacher management.
8. Admin class monitoring.

### 2.3 Non-Functional Requirements
The codebase implies several non-functional requirements.

#### 2.3.1 Modularity
Routes are lightweight and delegate logic to services. Services delegate persistence to repositories where appropriate. This improves maintainability and makes the backend easier to extend.

#### 2.3.2 Graceful Degradation
The word model is loaded in a best-effort manner. If the checkpoint is absent, the backend still boots and reports `ready = false` for the word subsystem rather than crashing the entire API.

#### 2.3.3 Real-Time Responsiveness
The frontend uses camera capture loops, deferred state, and confidence gating to keep the UI responsive while preventing noisy predictions from being treated as valid learning events.

#### 2.3.4 Data Persistence
The backend supports SQLite by default and PostgreSQL through `DATABASE_URL`. This allows local development and a more robust deployment path.

#### 2.3.5 Security
Password hashing, session token hashing, cookie-based sessions, and role-restricted endpoints are all implemented in the backend stack.

### 2.4 Users and Roles
The data model defines three roles:

1. `student`
2. `teacher`
3. `admin`

Students use the learning and live practice features. Teachers manage public profiles, schedules, messages, and class sessions. Administrators monitor platform users, teacher readiness, booking activity, and model-level metadata.

### 2.5 Limitations Identified at Analysis Stage
A code-based analysis also reveals current limitations:

1. Full continuous sentence translation is out of scope.
2. Alphabet motion letters such as `J` and `Z` are inherently harder and receive special notes in the UI and feedback logic.
3. Word recognition depends on server-side landmark extraction, which introduces additional inference cost relative to a pure client-only pipeline.
4. The system is strongly centered on isolated ASL labels rather than grammar-rich conversational signing.

## Chapter 3. Architecture and Design

### 3.1 Overall Architecture
SignSpeak uses a layered full-stack architecture:

1. React frontend for presentation and client interaction.
2. FastAPI backend for API contracts, inference orchestration, authentication, and business logic.
3. SQLAlchemy persistence layer for users, sessions, analytics, and educational workflows.
4. PyTorch and MediaPipe model layer for recognition and feature extraction.

The startup path in `api/app/main.py` initializes the database, configures CORS and session middleware, mounts media uploads, and preloads alphabet and word inference services in a background thread.

### 3.2 Backend Architectural Pattern
The backend is divided into:

1. `routers/` for HTTP endpoints.
2. `services/` for business rules and ML integration.
3. `repositories/` for database operations.
4. `models.py` for ORM definitions.
5. `schemas.py` for request and response contracts.

This is a conventional but effective service-oriented structure. It reduces route complexity and keeps inference, analytics, and auth concerns separate.

### 3.3 Database Design
The SQLAlchemy models define the core application entities:

1. `User`
2. `OAuthAccount`
3. `UserSession`
4. `PasswordResetToken`
5. `TranslationHistory`
6. `PracticeSession`
7. `LearningSession`
8. `LearningAttempt`
9. `TeacherProfile`
10. `LessonBooking`
11. `MessageThread`
12. `ThreadMessage`

The most important entities for the learning thesis are `LearningSession` and `LearningAttempt`.

`LearningSession` stores summarized work such as:

1. Track type.
2. Category.
3. Unit title.
4. Accuracy.
5. Correct item count.
6. Attempt count.
7. Duration.
8. Summary text.

`LearningAttempt` stores more granular evidence:

1. Expected label.
2. Predicted label.
3. Confidence.
4. Whether the model was confident.
5. Whether the attempt was correct.
6. Whether tracking succeeded.
7. Valid frame ratio for word recognition.

This split is a good design decision because it supports both per-attempt diagnostics and higher-level dashboards.

### 3.4 Inference Service Design

#### 3.4.1 Alphabet Inference Service
The alphabet service loads:

1. An optional image checkpoint.
2. One or more landmark checkpoints.
3. A MediaPipe hand tracker.

The runtime path is:

1. Decode browser image.
2. Run hand tracking.
3. Crop to the detected hand box when available.
4. Draw landmark overlays for annotated feedback.
5. Prefer landmark inference if landmarks exist.
6. Fall back to the image model if necessary.
7. Compute top predictions.
8. Apply confidence threshold and margin threshold.
9. Return structured feedback to the UI.

This design reflects a hybrid strategy: use the more semantically meaningful feature space when possible, but keep a backup appearance-based model.

#### 3.4.2 Word Inference Service
The word service loads the configured checkpoint from `artifacts/word_landmarks_v14_ft/best.pt`. For browser practice, the frontend does not send landmarks directly. Instead, it sends a short list of captured image frames. The backend then:

1. Lazily initializes MediaPipe hand and pose landmarkers.
2. Extracts left hand, right hand, and upper-body pose data for each frame.
3. Normalizes each frame relative to shoulder geometry.
4. Fills missing frames from neighboring valid features.
5. Computes the valid frame ratio.
6. Runs a temporal classifier on the feature sequence.
7. Re-applies confidence gating using both score and frame-quality conditions.

This is a strong design choice for educational deployment because it reduces client complexity and ensures that feature extraction and model expectations stay aligned.

### 3.5 Frontend Design
The React application defines public, protected, teacher-only, and admin-only routes. Major pages include:

1. Landing page.
2. Auth page.
3. Dashboard page.
4. Learning hub.
5. Alphabet lesson page.
6. Word lesson page.
7. Live translation workspace.
8. Progress page.
9. Teacher dashboard, schedule, messages, and settings pages.
10. Admin dashboard, users, teachers, and classes pages.

The learning UI follows a pedagogical structure:

1. Study mode shows references and cues.
2. Practice mode turns on the camera and requests live grading.
3. Stable predictions are required before counting a result.
4. Attempts are stored automatically.

This shows that the frontend is not decorative. It encodes concrete teaching logic.

> UI Screenshot Placeholder 1: Landing page overview
> UI Screenshot Placeholder 2: Student dashboard
> UI Screenshot Placeholder 3: Alphabet Coach study mode
> UI Screenshot Placeholder 4: Alphabet Coach practice mode with annotated frame
> UI Screenshot Placeholder 5: Word Studio study mode
> UI Screenshot Placeholder 6: Word Studio practice mode
> UI Screenshot Placeholder 7: Progress dashboard
> UI Screenshot Placeholder 8: Teacher dashboard
> UI Screenshot Placeholder 9: Admin dashboard

### 3.6 Confidence Gating and Feedback Design
The system does not treat the top softmax label as automatically valid. It introduces a gated interpretation layer:

1. Minimum confidence threshold.
2. Minimum margin over the runner-up class.
3. Tracking-detected requirement.
4. Minimum valid frame ratio for word prediction.

This design is central to usability. In educational contexts, an unstable prediction should not be counted as success or failure too early. The feedback strings in both alphabet and word services explicitly explain whether the issue is low confidence, poor tracking, motion instability, or a likely confusion with another class.

## Chapter 4. Data Pipeline and Machine Learning Methodology

### 4.1 Data Preparation Strategy
The codebase supports both raw image/video workflows and landmark-based workflows. The current direction of the project clearly prioritizes landmarks.

For alphabet:

1. Raw alphabet videos are downloaded into labeled folders.
2. `scripts/extract_alphabet_landmarks.py` samples frames from videos.
3. MediaPipe tracking detects a single hand.
4. Landmark features are normalized.
5. Samples are written into `records.json`.

For words:

1. Raw word videos are gathered by label.
2. `scripts/extract_word_landmarks.py` samples a fixed number of frames per clip.
3. MediaPipe extracts up to two hands plus pose landmarks.
4. Each frame is normalized into a 167-dimensional feature vector.
5. Each clip becomes a sequence of frame-level features.

### 4.2 Alphabet Feature Representation
Alphabet recognition uses a single-hand landmark representation. The model input is a normalized vector derived from hand landmarks, bounding box information, and handedness-aware normalization. This is appropriate because alphabet letters are mostly static handshapes, except for motion letters like `J` and `Z`.

### 4.3 Word Feature Representation
The word landmark representation is more complex. Each frame contains:

1. Left hand landmarks: `21 * 3 = 63` values.
2. Right hand landmarks: `21 * 3 = 63` values.
3. Upper-body pose subset landmarks: `13 * 3 = 39` values.
4. Two presence flags for left and right hands.

The total per-frame feature dimension is therefore:

`63 + 63 + 39 + 2 = 167`

Normalization is performed relative to the shoulder midpoint and shoulder width. This makes the features more invariant to translation and scale while preserving motion structure.

### 4.4 Sequence Processing
Word-level clips do not necessarily have identical durations, so the preprocessing pipeline includes:

1. Temporal cropping during training.
2. Resampling to a fixed sequence length.
3. Horizontal flip augmentation.
4. Rotation and scale jitter.
5. Gaussian noise on coordinates.
6. Time dropout.
7. Missing-frame filling.

These steps are important because they convert irregular landmark sequences into a model-ready format while preserving temporal structure.

### 4.5 Alphabet Model
The alphabet landmark model is a multi-layer feed-forward network with:

1. Linear layers.
2. Batch normalization.
3. ReLU activations.
4. Dropout.
5. A final classification layer.

This is sufficient because the input is already a compact landmark descriptor of a mostly static handshape. A temporal model is not strictly necessary for most letters.

The repository also contains an older alphabet image model trained on frame crops. Its measured performance is lower than the current landmark-based approach and it now acts as a fallback rather than the primary model.

### 4.6 Word Model
The word landmark recognizer uses:

1. Layer normalization on the input sequence.
2. A linear projection from input feature space into hidden space.
3. A bidirectional LSTM encoder.
4. Additive temporal attention.
5. A multi-layer classifier head.

This is a sensible architecture because word signs depend on motion patterns over time, not just a single frame. The bidirectional encoder captures context in both temporal directions, and the attention module allows the model to focus on the most informative frames.

### 4.7 Training Methodology
The training scripts show a disciplined methodology:

1. Train, validation, and test splits are produced by group-aware splitting.
2. Labels are stratified by grouped clip identities rather than random frame leakage.
3. Cross-entropy loss uses label smoothing.
4. AdamW is the optimizer.
5. Cosine annealing is the learning rate scheduler.
6. Automatic mixed precision is enabled on CUDA.
7. Gradient clipping is used.
8. Early stopping is applied through patience counters.

For word training specifically:

1. Balanced sampling can oversample weaker classes.
2. Time-axis CutMix can be enabled.
3. Mirror test-time augmentation can be applied during inference.

These details show the project is not a naive baseline. It includes concrete mechanisms for robustness and generalization.

### 4.8 Evaluation Methodology
Evaluation uses held-out splits and produces:

1. Validation accuracy during training.
2. Final test accuracy.
3. Test loss.
4. Classification reports.
5. Historical learning curves stored in `metrics.json`.

Because the checkpoints also save the split payloads, evaluation can reproduce the exact test partition later even if the raw dataset changes.

## Chapter 5. Implementation, Results, and Discussion

### 5.1 End-to-End User Flow
A student-level flow in the implemented system is:

1. Register or log in.
2. Open the learning hub.
3. Enter Alphabet Coach or Word Studio.
4. Review reference materials in study mode.
5. Activate the camera for practice mode.
6. Perform signs until the confidence gate accepts a stable match.
7. Save attempts and summary sessions automatically.
8. Review progress and weak areas on dashboard pages.

A teacher-level flow is:

1. Log in as teacher.
2. Complete profile card setup.
3. Publish profile.
4. Accept lesson requests.
5. View class schedules.
6. Join generated video rooms.
7. Exchange messages with students.

An admin-level flow is:

1. Monitor total users, teachers, bookings, and recent learning activity.
2. Review teacher profiles.
3. Manage users and classes.
4. Inspect active model metadata and low-accuracy labels.

### 5.2 Backend Implementation Discussion
The backend implementation is notable for three reasons.

First, the API surface is broad enough to support a real application, not only model calls. The inference endpoints are a subset of the backend rather than the whole backend.

Second, the dependency graph is clean. For example, inference services are cached and reused, analytics logic is isolated in `AnalyticsService`, and auth state is not mixed into ML code.

Third, the project uses practical startup behavior. The app initializes even when some checkpoints are absent, which is critical for developer experience and staged deployment.

### 5.3 Frontend Implementation Discussion
The frontend implements several good interaction patterns:

1. Protected route boundaries by role.
2. Camera management through refs and explicit start/stop control.
3. Stable prediction locking to avoid noisy scoring.
4. Immediate feedback through annotated frames and top predictions.
5. Separate study and practice modes for pedagogy.
6. Best-effort persistence of attempts and sessions to the backend.

The frontend is not merely a form-based wrapper around API calls. It encodes timing, repetition, and lesson progression rules that shape the educational experience.

### 5.4 Experimental Results from Local Artifacts

#### 5.4.1 Alphabet Image Baseline
The older image-based alphabet checkpoint in `artifacts/alphabet_frames_v1/metrics.json` reports:

1. Best validation accuracy: `0.4872`
2. Test accuracy: `0.4615`
3. Test loss: `1.9242`

This result is relatively weak for a 26-letter alphabet task and supports the project’s later shift toward landmark-based recognition.

#### 5.4.2 Current Alphabet Landmark Model
The currently configured alphabet checkpoint is `artifacts/alphabet_landmarks_v8/best.pt`. Its corresponding metrics report:

1. Best validation accuracy: `0.9514`
2. Test accuracy: `0.9624`
3. Test loss: `0.3240`

This is a major improvement over the image baseline. The most plausible explanation, based on the implementation, is that hand landmarks provide a more stable representation of finger geometry and reduce background variance.

#### 5.4.3 Current Word Landmark Model
The configured word checkpoint is `artifacts/word_landmarks_v14_ft/best.pt`. Its metrics report:

1. Best validation accuracy: `0.9224`
2. Test accuracy: `0.9197`
3. Test loss: `0.7729`
4. Vocabulary size: `80` labels

For an isolated sign vocabulary of this size, the result is strong and demonstrates that the landmark-sequence approach generalizes beyond a tiny toy set.

### 5.5 Result Interpretation
Several conclusions can be drawn from the measured outputs.

#### 5.5.1 Landmarks Are the Correct Primary Representation
The alphabet results show a dramatic gap between appearance-based image classification and geometric landmark classification. This validates the project’s decision to make the live alphabet backend landmark-first.

#### 5.5.2 Temporal Modeling Matters for Words
The word recognizer uses LSTM plus attention rather than a static classifier. This is appropriate because many signs differ through movement, trajectory, or relative timing rather than single-hand posture alone.

#### 5.5.3 Application Logic Improves Practical Reliability
Even a good classifier can produce unstable outputs in live use. The code addresses this with:

1. Threshold gating.
2. Margin gating.
3. Stable frame locking.
4. Valid frame ratio checks.
5. Tracking-aware feedback.

These additions improve the educational value of the output because they prevent premature grading.

### 5.6 Strengths of the Current System
The implementation has several clear strengths.

1. It is truly end to end.
2. It integrates ML with learning workflows instead of isolating prediction.
3. It uses modern landmark extraction rather than pure RGB dependence.
4. It supports both local experimentation and web delivery.
5. It includes analytics, which allows long-term learning insight.
6. It includes teacher and admin features, making it extensible toward a fuller platform.

### 5.7 Current Limitations
The implementation also has limitations that should be stated clearly.

1. It performs isolated sign recognition, not continuous sign language translation.
2. Some letters and words remain difficult under motion, occlusion, or low lighting.
3. The word pipeline depends on server-side MediaPipe extraction, which adds latency and infrastructure load.
4. The vocabulary is finite and checkpoint-dependent.
5. There is no linguistic modeling of ASL grammar or sentence structure.
6. Browser practice still depends on camera quality and framing discipline from the user.

### 5.8 Discussion in Educational Context
From an educational systems perspective, the most important contribution of this project is the feedback loop rather than the classifier alone. The lesson pages combine:

1. Reference media.
2. Target selection.
3. Live grading.
4. Repetition counting.
5. Attempt storage.
6. Dashboard visualization.

This supports self-correction and self-monitoring. In other words, the system teaches through guided repetition rather than only reporting recognition output.

## Chapter 6. Conclusion and Future Work

### 6.1 Conclusion
SignSpeak demonstrates a mature implementation of a sign language learning and recognition platform built from multiple coordinated subsystems. The project combines:

1. Landmark-based machine learning models.
2. Backend service orchestration.
3. Role-based web application design.
4. Camera-driven lesson workflows.
5. Persistent learning analytics.

The codebase shows a clear progression from simpler image-based recognition toward more robust landmark-first approaches. The current local artifacts support that direction quantitatively. The alphabet landmark model reaches approximately `96.24%` held-out test accuracy, far above the old image baseline. The current word landmark model reaches approximately `91.97%` held-out test accuracy over an 80-word vocabulary, showing that the system scales beyond a minimal demonstration set.

The strongest aspect of the project is that it moves beyond model-centric experimentation. It operationalizes recognition inside a usable educational environment with structured study, live validation, analytics, scheduling, and administrative oversight. That makes it a stronger software engineering contribution than a standalone classifier.

### 6.2 Recommended Future Work
The next development steps should focus on both ML and product evolution.

#### 6.2.1 Machine Learning Improvements
1. Add continuous sign segmentation and sentence-level modeling.
2. Explore transformer-based temporal encoders for longer sign sequences.
3. Expand signer diversity and environmental diversity in datasets.
4. Add per-class calibration analysis and confidence calibration.
5. Improve handling of motion-heavy signs and fine-grained confusions.

#### 6.2.2 Application Improvements
1. Add richer teacher review of student attempts.
2. Add personalized lesson recommendations from weak-area analytics.
3. Add downloadable reports and practice history timelines.
4. Add class-level assignments and teacher feedback annotations.
5. Add offline or edge-assisted inference options for lower latency.

#### 6.2.3 Research Extensions
1. Compare hand-only versus hand-plus-pose contributions more formally.
2. Measure real-time latency end to end in browser and API settings.
3. Conduct user studies with beginner sign learners.
4. Evaluate learning outcomes, not only recognition accuracy.

### 6.3 Final Statement
The present implementation is already substantial enough to be discussed as a thesis project because it integrates machine learning, backend engineering, frontend interaction design, and learning analytics into one coherent product. The repository supports a defensible thesis argument: landmark-driven sign recognition becomes much more valuable when embedded inside a structured learning platform, and SignSpeak is a concrete working example of that principle.
