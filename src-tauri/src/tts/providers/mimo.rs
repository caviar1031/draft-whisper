use crate::tts::types::{TtsMode, TtsParams};
use serde_json::{json, Value};

pub(crate) fn build_chat_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

pub(crate) fn build_mimo_speech_body(
    params: &TtsParams,
    text: &str,
    clone_voice: Option<&str>,
) -> Result<Value, String> {
    let model = params.model.trim();
    if model.is_empty() {
        return Err("Model ID cannot be empty".into());
    }

    let mut messages = Vec::new();
    if params.mode == TtsMode::VoiceDesign {
        if params.voice_design_prompt.trim().is_empty() {
            return Err("Voice design requires a description prompt".into());
        }
        messages.push(json!({
            "role": "user",
            "content": params.voice_design_prompt.trim(),
        }));
    } else if !params.performance_prompt.trim().is_empty() {
        messages.push(json!({
            "role": "user",
            "content": params.performance_prompt.trim(),
        }));
    }

    messages.push(json!({
        "role": "assistant",
        "content": text,
    }));

    let mut audio = json!({
        "format": "wav",
    });

    match params.mode {
        TtsMode::VoiceClone => {
            let Some(voice) = clone_voice else {
                return Err("Voice clone requires a reference audio sample".into());
            };
            audio["voice"] = json!(voice);
        }
        TtsMode::Basic => {
            let voice = params.voice.trim();
            if voice.is_empty() {
                return Err("Basic voice mode requires a selected voice".into());
            }
            audio["voice"] = json!(voice);
        }
        TtsMode::VoiceDesign => {}
    }

    Ok(json!({
        "model": model,
        "messages": messages,
        "audio": audio,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tts::types::ProviderId;

    fn test_params(mode: TtsMode, model: &str) -> TtsParams {
        TtsParams {
            provider: ProviderId::Mimo,
            base_url: "https://example.com/v1".into(),
            api_key: "test-key".into(),
            model: model.into(),
            mode,
            voice: "冰糖".into(),
            voice_design_prompt: "温柔的年轻女声".into(),
            voice_clone_path: Some("/audio/sample.wav".into()),
            performance_prompt: "语速稍慢，像在讲故事".into(),
        }
    }

    #[test]
    fn normalizes_mimo_endpoints() {
        assert_eq!(
            build_chat_endpoint("https://example.com/v1/"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_endpoint("https://example.com/v1/chat/completions"),
            "https://example.com/v1/chat/completions"
        );
        assert_eq!(
            build_chat_endpoint("https://example.com"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn builds_voice_clone_request_with_data_uri_and_performance_prompt() {
        let params = test_params(TtsMode::VoiceClone, "mimo-v2.5-tts-voiceclone");
        let body = build_mimo_speech_body(&params, "你好", Some("data:audio/wav;base64,UklGRg=="))
            .unwrap();

        assert_eq!(body["model"], "mimo-v2.5-tts-voiceclone");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"], "语速稍慢，像在讲故事");
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert_eq!(body["audio"]["voice"], "data:audio/wav;base64,UklGRg==");
    }

    #[test]
    fn builds_voice_design_request_from_the_user_description() {
        let params = test_params(TtsMode::VoiceDesign, "mimo-v2.5-tts-voicedesign");
        let body = build_mimo_speech_body(&params, "你好", None).unwrap();

        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"], "温柔的年轻女声");
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert!(body["audio"].get("voice").is_none());
    }

    #[test]
    fn accepts_user_configured_model_ids() {
        let params = test_params(TtsMode::VoiceClone, "custom-clone-model");
        let body =
            build_mimo_speech_body(&params, "你好", Some("data:audio/wav;base64,AA==")).unwrap();
        assert_eq!(body["model"], "custom-clone-model");
    }

    #[test]
    fn rejects_empty_model_ids() {
        let params = test_params(TtsMode::Basic, " ");
        assert!(build_mimo_speech_body(&params, "hello", None).is_err());
    }
}
