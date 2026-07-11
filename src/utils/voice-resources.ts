import type { VoiceCloneSample, VoiceDesignPreset } from "@/types"

interface ProjectVoiceSelection {
  voiceDesignId: string | null
  voiceDesignPrompt: string
  voiceCloneSampleId: string | null
  voiceClonePath: string | null
}

export function resolveProjectVoiceResources(
  project: ProjectVoiceSelection,
  designs: VoiceDesignPreset[],
  samples: VoiceCloneSample[],
) {
  const design = designs.find((item) => item.id === project.voiceDesignId)
  const sample = samples.find(
    (item) => item.id === project.voiceCloneSampleId && item.durationMs !== null,
  )
  return {
    voiceDesignPrompt: design?.prompt ?? project.voiceDesignPrompt,
    voiceClonePath: sample?.filePath ?? project.voiceClonePath,
  }
}
