use crate::tts::types::TtsParams;
use serde_json::{json, Value};

pub(crate) fn custom_speech_endpoint(endpoint_url: &str) -> &str {
    endpoint_url.trim()
}

pub(crate) fn build_custom_speech_body(params: &TtsParams, text: &str) -> Result<Value, String> {
    let model = params.model.trim();
    if model.is_empty() {
        return Err("Model ID cannot be empty".into());
    }
    let voice = params.voice.trim();
    if voice.is_empty() {
        return Err("Custom OpenAI-compatible TTS requires a voice ID".into());
    }

    let mut body = json!({
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": params.audio_format.as_str(),
    });

    if !params.performance_prompt.trim().is_empty() {
        body["instructions"] = json!(params.performance_prompt.trim());
    }

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tts::types::{AudioFormat, ProviderId, TtsMode};

    fn test_params(mode: TtsMode, model: &str) -> TtsParams {
        TtsParams {
            provider: ProviderId::Custom,
            base_url: "https://vendor.example/api/tts".into(),
            api_key: "test-key".into(),
            model: model.into(),
            mode,
            voice: "vendor-voice".into(),
            voice_design_prompt: "".into(),
            voice_clone_path: None,
            performance_prompt: "speak clearly".into(),
            audio_format: AudioFormat::Mp3,
        }
    }

    #[test]
    fn preserves_custom_endpoint_paths() {
        assert_eq!(
            custom_speech_endpoint("  https://vendor.example/api/tts/generate?version=2  "),
            "https://vendor.example/api/tts/generate?version=2"
        );
    }

    #[test]
    fn builds_custom_openai_compatible_request() {
        let mut params = test_params(TtsMode::Basic, "third-party-tts");
        params.voice = "vendor-voice".into();
        let body = build_custom_speech_body(&params, "Hello").unwrap();

        assert_eq!(body["model"], "third-party-tts");
        assert_eq!(body["input"], "Hello");
        assert_eq!(body["voice"], "vendor-voice");
        assert_eq!(body["response_format"], "mp3");
        assert_eq!(body["instructions"], params.performance_prompt);
    }

    #[test]
    fn omits_empty_custom_instructions() {
        let mut params = test_params(TtsMode::Basic, "third-party-tts");
        params.performance_prompt.clear();
        let body = build_custom_speech_body(&params, "Hello").unwrap();

        assert!(body.get("instructions").is_none());
    }
}
