export type User = {
  id: number
  email: string
  display_name: string
  age: number | null
  bio: string | null
  avatar_url: string | null
  created_at: string
}

export type AuthResponse = {
  expires_at: string
  user: User
}

export type AuthProviderOption = {
  id: string
  label: string
  start_url: string
}

export type AuthProvidersResponse = {
  providers: AuthProviderOption[]
}

export type ForgotPasswordResponse = {
  status: string
  detail: string
  reset_url: string | null
}

export type HealthResponse = {
  status: string
  alphabet_model_ready: boolean
  image_model_ready: boolean
  landmark_model_ready: boolean
  word_model_ready: boolean
  word_labels: string[]
  labels: string[]
  oauth_providers: string[]
}

export type WordVocabularyResponse = {
  labels: string[]
  sequence_length: number
  feature_dim: number
  ready: boolean
}

export type WordPrediction = {
  label: string
  score: number
}

export type WordPredictResponse = {
  predicted_word: string
  confidence: number
  is_confident: boolean
  matches_target: boolean | null
  tracking_detected: boolean
  valid_frame_ratio: number
  feedback: string
  target_word: string | null
  top_predictions: WordPrediction[]
}

export type DashboardOverview = {
  stats: {
    signs_mastered: number
    practice_streak: number
    live_accuracy: number
    translations_this_week: number
    daily_goal_percent: number
    daily_goal_remaining_minutes: number
    rank_label: string
  }
  recent_translations: Array<{
    id: number
    source_type: string
    transcript: string
    confidence: number
    created_at: string
    status_label: string
  }>
  recent_detections: string[]
  categories: Array<{
    name: string
    mastered: number
    percent: number
  }>
  insight: {
    headline: string
    detail: string
  }
}

export type ProgressOverview = {
  totals: {
    signs_mastered: number
    streak_days: number
    level: number
    level_title: string
    xp_points: number
    next_level_xp: number
    progress_percent: number
  }
  heatmap: number[]
  weekly_accuracy: number[]
  categories: Array<{
    name: string
    mastered: number
    percent: number
  }>
  weak_areas: Array<{
    name: string
    accuracy: number
  }>
  achievements: Array<{
    name: string
    description: string
    unlocked: boolean
  }>
}

export type TopPrediction = {
  label: string
  score: number
}

export type PredictResponse = {
  target_letter: string | null
  predicted_letter: string
  confidence: number
  is_confident: boolean
  matches_target: boolean | null
  tracking_detected: boolean
  feedback: string
  top_predictions: TopPrediction[]
  annotated_image_base64: string | null
}

export type GuidePoint = {
  x: number
  y: number
  z: number
}

export type AlphabetLessonItem = {
  label: string
  cue: string
  motion_letter: boolean
  guide_points: GuidePoint[]
  reference_image_path: string | null
}

export type AlphabetLessonResponse = {
  sequence: AlphabetLessonItem[]
  connections: Array<[number, number]>
  stable_frames: number
  threshold: number
  min_margin: number
  note: string
}

export type WordLessonItem = {
  label: string
  title: string
  category: string
  difficulty: string
  description: string
  coach_tip: string
  phrase: string
  reference_video_path: string | null
}

export type WordLessonResponse = {
  items: WordLessonItem[]
  phrase_drills: Array<{
    title: string
    phrase: string
    focus: string
  }>
  note: string
}
