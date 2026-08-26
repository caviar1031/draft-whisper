use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TtsMode {
    Basic,
    VoiceDesign,
    VoiceClone,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ProviderId {
    #[serde(rename = "mimo")]
    Mimo,
    #[serde(rename = "fish-audio")]
    FishAudio,
    #[serde(rename = "custom")]
    Custom,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Wav,
}

impl AudioFormat {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Mp3 => "mp3",
            Self::Wav => "wav",
        }
    }

    pub(crate) const fn extension(self) -> &'static str {
        self.as_str()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsParams {
    pub provider: ProviderId,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub mode: TtsMode,
    pub voice: String,
    pub voice_design_prompt: String,
    pub voice_clone_path: Option<String>,
    pub performance_prompt: String,
    pub audio_format: AudioFormat,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub audio_path: String,
}
