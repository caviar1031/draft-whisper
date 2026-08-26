pub(crate) mod custom;
pub(crate) mod fish_audio;
pub(crate) mod mimo;

use std::sync::OnceLock;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;

use crate::audio::validation;
use crate::tts::types::{ProviderId, TtsParams};

/// 全局共享的 HTTP Client（复用连接池 + 超时配置）。
pub(crate) fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client")
    })
}

pub(crate) fn build_speech_body(
    params: &TtsParams,
    text: &str,
    voice_audio_data_uri: Option<&str>,
) -> Result<Value, String> {
    match params.provider {
        ProviderId::Mimo => mimo::build_mimo_speech_body(params, text, voice_audio_data_uri),
        ProviderId::FishAudio => fish_audio::build_fish_speech_body(params, text),
        ProviderId::Custom => custom::build_custom_speech_body(params, text),
    }
}

/// Dispatch a provider-specific TTS request and return validated audio bytes.
pub(crate) async fn request_speech(
    params: &TtsParams,
    text: &str,
    voice_audio_data_uri: Option<&str>,
) -> Result<Vec<u8>, String> {
    let body = build_speech_body(params, text, voice_audio_data_uri)?;
    let client = http_client();
    let resp = match params.provider {
        ProviderId::Mimo => {
            client
                .post(mimo::build_chat_endpoint(&params.base_url))
                .header("api-key", &params.api_key)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
        }
        ProviderId::FishAudio => {
            client
                .post(fish_audio::build_fish_tts_endpoint(&params.base_url))
                .bearer_auth(&params.api_key)
                .header("Content-Type", "application/json")
                .header("model", params.model.trim())
                .json(&body)
                .send()
                .await
        }
        ProviderId::Custom => {
            client
                .post(custom::custom_speech_endpoint(&params.base_url))
                .bearer_auth(&params.api_key)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
        }
    }
    .map_err(|e| format!("Request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {status}: {text}"));
    }

    if matches!(params.provider, ProviderId::FishAudio | ProviderId::Custom) {
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let bytes = resp
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|e| format!("Failed to read audio response: {e}"));
        let bytes = bytes?;
        validation::validate_raw_audio_response(
            params.audio_format.as_str(),
            content_type.as_deref(),
            &bytes,
        )?;
        return Ok(bytes);
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {e}"))?;

    let audio_data = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("audio"))
        .and_then(|a| a.get("data"))
        .and_then(|d| d.as_str())
        .ok_or_else(|| format!("Response missing choices[0].message.audio.data: {}", json))?;

    let bytes = STANDARD
        .decode(audio_data)
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    validation::validate_generated_audio(params.audio_format.as_str(), &bytes)?;
    Ok(bytes)
}
