import { LivePage } from './LivePage'

export function LearningTestPage() {
  return (
    <LivePage
      title="Learning Test"
      subtitle="Test your alphabet recognition in camera mode. Pick a target letter, hold the sign steady, and use the confidence and stability gates to see whether the model accepts the pose."
      showLearnSubnav
    />
  )
}

