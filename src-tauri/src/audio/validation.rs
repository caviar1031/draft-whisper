use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;

pub(crate) const MAX_VOICE_CLONE_DATA_URI_SIZE: usize = 10 * 1024 * 1024;
pub(crate) const MAX_VOICE_CLONE_DURATION_MS: u64 = 30_000;

pub(crate) fn validate_voice_clone_data_uri_size(size: usize) -> Result<(), String> {
    if size >= MAX_VOICE_CLONE_DATA_URI_SIZE {
        return Err(format!(
            "Voice clone sample is too large after Base64 encoding ({:.2} MB); it must be under 10 MB",
            size as f64 / 1024.0 / 1024.0
        ));
    }
    Ok(())
}

pub(crate) fn audio_format(path: &Path) -> Result<(&'static str, &'static str), String> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("wav") => Ok(("wav", "audio/wav")),
        Some("mp3") => Ok(("mp3", "audio/mpeg")),
        _ => Err("Voice clone samples must be WAV or MP3 files".into()),
    }
}

pub(crate) fn validate_audio_signature(format: &str, bytes: &[u8]) -> Result<(), String> {
    let valid = match format {
        "wav" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE",
        "mp3" => {
            bytes.starts_with(b"ID3")
                || (bytes.len() >= 2 && bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0)
        }
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(format!(
            "The selected file content does not match its .{format} extension"
        ))
    }
}

pub(crate) fn validate_generated_audio(format: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err(format!(
            "Provider returned an empty {format} audio response"
        ));
    }
    validate_audio_signature(format, bytes)
        .map_err(|_| format!("Provider returned invalid {format} audio data"))?;
    audio_duration_ms(format, bytes)
        .map_err(|error| format!("Provider returned unreadable {format} audio data: {error}"))?;
    Ok(())
}

pub(crate) fn validate_raw_audio_response(
    format: &str,
    content_type: Option<&str>,
    bytes: &[u8],
) -> Result<(), String> {
    if let Some(content_type) = content_type {
        let normalized = content_type
            .split(';')
            .next()
            .unwrap_or(content_type)
            .trim()
            .to_ascii_lowercase();
        if normalized.starts_with("text/") || normalized == "application/json" {
            return Err(format!(
                "Provider returned {content_type} instead of {format} audio"
            ));
        }
    }
    validate_generated_audio(format, bytes)
}

pub(crate) fn wav_duration_ms(bytes: &[u8]) -> Result<u64, String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Invalid WAV header".into());
    }
    let mut offset = 12usize;
    let mut byte_rate = None;
    let mut data_size = None;
    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size =
            u32::from_le_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        let data_start = offset + 8;
        if data_start + chunk_size > bytes.len() {
            return Err("Invalid WAV chunk size".into());
        }
        if chunk_id == b"fmt " && chunk_size >= 12 {
            byte_rate = Some(u32::from_le_bytes(
                bytes[data_start + 8..data_start + 12].try_into().unwrap(),
            ));
        } else if chunk_id == b"data" {
            data_size = Some(chunk_size as u64);
        }
        offset = data_start + chunk_size + (chunk_size % 2);
    }
    let byte_rate = byte_rate
        .filter(|rate| *rate > 0)
        .ok_or("WAV byte rate is missing")?;
    let data_size = data_size.ok_or("WAV audio data is missing")?;
    Ok(data_size.saturating_mul(1000) / u64::from(byte_rate))
}

pub(crate) fn mp3_duration_ms(bytes: &[u8]) -> Result<u64, String> {
    let mut offset = if bytes.len() >= 10 && bytes.starts_with(b"ID3") {
        10 + (((bytes[6] & 0x7f) as usize) << 21)
            + (((bytes[7] & 0x7f) as usize) << 14)
            + (((bytes[8] & 0x7f) as usize) << 7)
            + (bytes[9] & 0x7f) as usize
    } else {
        0
    };
    let mut duration_micros = 0u64;
    let mut frame_count = 0usize;
    while offset + 4 <= bytes.len() {
        let header = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap());
        if header & 0xffe0_0000 != 0xffe0_0000 {
            offset += 1;
            continue;
        }
        let version = (header >> 19) & 0b11;
        let layer = (header >> 17) & 0b11;
        let bitrate_index = ((header >> 12) & 0b1111) as usize;
        let sample_index = ((header >> 10) & 0b11) as usize;
        if version == 0b01
            || layer != 0b01
            || bitrate_index == 0
            || bitrate_index == 15
            || sample_index == 3
        {
            offset += 1;
            continue;
        }
        const MPEG1_BITRATES: [u32; 16] = [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
        ];
        const MPEG2_BITRATES: [u32; 16] = [
            0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
        ];
        const BASE_SAMPLE_RATES: [u32; 3] = [44_100, 48_000, 32_000];
        let is_mpeg1 = version == 0b11;
        let bitrate = if is_mpeg1 {
            MPEG1_BITRATES[bitrate_index]
        } else {
            MPEG2_BITRATES[bitrate_index]
        };
        let divisor = match version {
            0b11 => 1,
            0b10 => 2,
            0b00 => 4,
            _ => unreachable!(),
        };
        let sample_rate = BASE_SAMPLE_RATES[sample_index] / divisor;
        let padding = ((header >> 9) & 1) as usize;
        let coefficient = if is_mpeg1 { 144 } else { 72 };
        let frame_length = coefficient * bitrate as usize * 1000 / sample_rate as usize + padding;
        if frame_length < 4 || offset + frame_length > bytes.len() {
            break;
        }
        let samples_per_frame = if is_mpeg1 { 1152u64 } else { 576u64 };
        duration_micros += samples_per_frame * 1_000_000 / u64::from(sample_rate);
        frame_count += 1;
        offset += frame_length;
    }
    if frame_count == 0 {
        return Err("No valid MP3 audio frames found".into());
    }
    Ok(duration_micros / 1000)
}

pub(crate) fn audio_duration_ms(format: &str, bytes: &[u8]) -> Result<u64, String> {
    match format {
        "wav" => wav_duration_ms(bytes),
        "mp3" => mp3_duration_ms(bytes),
        _ => Err("Unsupported audio format".into()),
    }
}

pub(crate) fn validate_voice_clone_duration(duration_ms: u64) -> Result<(), String> {
    if duration_ms >= MAX_VOICE_CLONE_DURATION_MS {
        return Err(format!(
            "Voice clone sample is too long ({:.1} seconds); it must be under 30 seconds",
            duration_ms as f64 / 1000.0
        ));
    }
    Ok(())
}

pub(crate) fn build_voice_clone_data_uri(path: &Path) -> Result<String, String> {
    let (format, mime_type) = audio_format(path)?;
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read voice clone reference audio: {e}"))?;
    validate_audio_signature(format, &bytes)?;
    let duration_ms = audio_duration_ms(format, &bytes)?;
    validate_voice_clone_duration(duration_ms)?;
    let data_uri = format!("data:{mime_type};base64,{}", STANDARD.encode(bytes));
    validate_voice_clone_data_uri_size(data_uri.len())?;
    Ok(data_uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_audio_formats_and_signatures() {
        assert_eq!(audio_format(Path::new("sample.wav")).unwrap().0, "wav");
        assert_eq!(
            audio_format(Path::new("sample.mp3")).unwrap().1,
            "audio/mpeg"
        );
        assert!(audio_format(Path::new("sample.m4a")).is_err());
        assert!(validate_audio_signature("wav", b"RIFF\0\0\0\0WAVE").is_ok());
        assert!(validate_audio_signature("mp3", b"ID3\0").is_ok());
        assert!(validate_audio_signature("wav", b"not-a-wave").is_err());
    }

    #[test]
    fn rejects_non_audio_generated_responses() {
        assert!(validate_generated_audio("wav", b"<!DOCTYPE html>").is_err());
        assert!(validate_raw_audio_response("mp3", Some("text/html"), b"not-audio").is_err());
    }

    #[test]
    fn enforces_ten_megabyte_encoded_sample_limit() {
        assert!(validate_voice_clone_data_uri_size(MAX_VOICE_CLONE_DATA_URI_SIZE - 1).is_ok());
        assert!(validate_voice_clone_data_uri_size(MAX_VOICE_CLONE_DATA_URI_SIZE).is_err());
    }

    #[test]
    fn reads_wav_and_mp3_duration_and_enforces_thirty_seconds() {
        let data_size = 16_000u32;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&8_000u32.to_le_bytes());
        wav.extend_from_slice(&16_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        wav.resize(wav.len() + data_size as usize, 0);
        assert_eq!(audio_duration_ms("wav", &wav).unwrap(), 1_000);

        let mut mp3 = Vec::new();
        for _ in 0..10 {
            let mut frame = vec![0u8; 417];
            frame[0..4].copy_from_slice(&[0xff, 0xfb, 0x90, 0x00]);
            mp3.extend(frame);
        }
        let duration = audio_duration_ms("mp3", &mp3).unwrap();
        assert!((250..=270).contains(&duration));
        assert!(validate_voice_clone_duration(29_999).is_ok());
        assert!(validate_voice_clone_duration(30_000).is_err());
    }
}
