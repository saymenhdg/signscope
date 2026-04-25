export type User = {
  id: number
  email: string
  display_name: string
  role: 'student' | 'teacher'
  age: number | null
  bio: string | null
  avatar_url: string | null
  created_at: string
}

export type AuthResponse = {
  expires_at: string
  user: User
}

export type TeacherDashboard = {
  profile_completion_percent: number
  account_status: string
  joined_at: string
  readiness_checks: Array<{
    id: string
    label: string
    done: boolean
  }>
  stats: {
    upcoming_lessons: number
    pending_requests: number
    completed_lessons: number
    profile_completion_percent: number
  }
  profile_card: TeacherProfileCard | null
  booking_requests: LessonBooking[]
}

export type TeacherSchedule = {
  bookings: LessonBooking[]
  totals: {
    total: number
    upcoming: number
    pending: number
    confirmed: number
    completed: number
    cancelled: number
  }
}

export type StudentSchedule = {
  bookings: LessonBooking[]
  totals: {
    total: number
    upcoming: number
    pending: number
    confirmed: number
    completed: number
    cancelled: number
  }
}

export type TeacherProfileCardUpdatePayload = {
  headline: string
  intro: string
  specialties: string[]
  hourly_rate_usd: number | null
  lesson_duration_minutes: number
  is_public: boolean
}

export type TeacherProfileCard = {
  teacher_id: number
  display_name: string
  avatar_url: string | null
  headline: string | null
  intro: string | null
  specialties: string[]
  hourly_rate_usd: number | null
  lesson_duration_minutes: number
  is_public: boolean
}

export type TeacherDirectoryResponse = {
  teachers: TeacherProfileCard[]
}

export type LessonBooking = {
  id: number
  teacher_id: number
  student_id: number
  scheduled_at: string
  duration_minutes: number
  status: 'pending' | 'confirmed' | 'declined' | 'completed' | 'cancelled' | string
  note: string | null
  student_name: string
  student_email: string
  teacher_name: string
  room_name: string | null
  can_join: boolean
  join_starts_at: string | null
  join_ends_at: string | null
  created_at: string
}

export type LessonBookingStatus = 'confirmed' | 'declined' | 'completed' | 'cancelled'

export type ClassSession = {
  booking: LessonBooking
  join_url: string | null
  can_join: boolean
  meeting_domain: string
  room_name: string | null
}

export type TeacherMessageThreadSummary = {
  thread_id: number
  student_id: number
  student_name: string
  student_email: string
  student_avatar_url: string | null
  last_message_preview: string
  last_message_at: string
  unread_count: number
  booking_count: number
}

export type TeacherMessage = {
  id: number
  sender_id: number
  sender_name: string
  body: string
  created_at: string
  is_own: boolean
}

export type TeacherMessagesInbox = {
  threads: TeacherMessageThreadSummary[]
  unread_count: number
}

export type TeacherMessageThread = {
  thread: TeacherMessageThreadSummary
  messages: TeacherMessage[]
}

export type TeacherNotificationItem = {
  id: string
  type: 'booking_request' | 'message'
  title: string
  detail: string
  created_at: string
  action_path: string
  count: number
}

export type TeacherNotifications = {
  unread_count: number
  items: TeacherNotificationItem[]
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
  track_breakdown: Array<{
    track: string
    label: string
    sessions: number
    attempts: number
    correct: number
    accuracy: number
    percent: number
  }>
  focus_labels: Array<{
    label: string
    track: string
    attempts: number
    accuracy: number
  }>
  recent_sessions: Array<{
    id: number
    track: string
    category: string
    unit_title: string
    accuracy: number
    completed_items: number
    correct_items: number
    attempts_count: number
    duration_minutes: number
    completed_at: string
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
  reference_video_path: string | null
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
