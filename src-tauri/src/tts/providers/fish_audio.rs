use crate::tts::types::{TtsMode, TtsParams};
use serde_json::{json, Value};

pub(crate) fn build_fish_tts_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/tts") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/tts")
    } else {
        format!("{trimmed}/v1/tts")
    }
}

pub(crate) fn build_fish_speech_body(params: &TtsParams, text: &str) -> Result<Value, String> {
    if params.mode != TtsMode::Basic {
        return Err("Fish Audio currently only supports Basic voice mode".into());
    }
    let model = params.model.trim();
    if model.is_empty() {
        return Err("Model ID cannot be empty".into());
    }
    let voice = params.voice.trim();
    if voice.is_empty() {
        return Err("Fish Audio requires a reference voice ID".into());
    }

    Ok(json!({
        "text": text,
        "reference_id": voice,
        "format": "wav",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tts::types::ProviderId;

    fn test_params(mode: TtsMode, model: &str) -> TtsParams {
        TtsParams {
            provider: ProviderId::FishAudio,
            base_url: "https://api.fish.audio".into(),
            api_key: "test-key".into(),
            model: model.into(),
            mode,
            voice: "ca3007f96ae7499ab87d27ea3599956a".into(),
            voice_design_prompt: "".into(),
            voice_clone_path: None,
            performance_prompt: "".into(),
        }
    }

    #[test]
    fn normalizes_fish_audio_endpoints() {
        assert_eq!(
            build_fish_tts_endpoint("https://api.fish.audio"),
            "https://api.fish.audio/v1/tts"
        );
        assert_eq!(
            build_fish_tts_endpoint("https://api.fish.audio/v1/"),
            "https://api.fish.audio/v1/tts"
        );
        assert_eq!(
            build_fish_tts_endpoint("https://proxy.example/v1/tts"),
            "https://proxy.example/v1/tts"
        );
    }

    #[test]
    fn builds_fish_audio_basic_request() {
        let mut params = test_params(TtsMode::Basic, "s2.1-pro-free");
        params.voice = "ca3007f96ae7499ab87d27ea3599956a".into();
        let body = build_fish_speech_body(&params, "Hello").unwrap();

        assert_eq!(body["text"], "Hello");
        assert_eq!(body["reference_id"], params.voice);
        assert_eq!(body["format"], "wav");
        assert!(body.get("model").is_none());
    }

    #[test]
    fn rejects_unsupported_fish_audio_modes() {
        let params = test_params(TtsMode::VoiceDesign, "s2.1-pro-free");
        assert!(build_fish_speech_body(&params, "Hello").is_err());
    }
}
