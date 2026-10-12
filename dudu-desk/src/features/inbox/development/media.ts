import type { MediaReference } from "../types";

/**
 * Mock 媒体字节：与真实读取路径共存——只有渠道标识、没有公开链接的素材在开发世界由
 * 适配器按引用合成字节。音频给一段静音 WAV（可播放、可复现）；其余类型按声明的
 * 内容类型返回占位字节，无法解码时界面沿用现有失败提示，不伪造可播放的假媒体。
 */
export function developmentMediaBytes(media: MediaReference): Blob {
  if (media.kind === "audio") return silentWav();
  return new Blob([new Uint8Array([0, 0, 0, 0])], {
    type: media.mimeType || "application/octet-stream",
  });
}

// 8kHz 8 位无符号单声道 0.1 秒静音：44 字节 WAV 头加 800 个静音采样（中值 128）
function silentWav(): Blob {
  const sampleCount = 800;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(view, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount, true);
  const samples = new Uint8Array(sampleCount).fill(128);
  return new Blob([header, samples], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
