/** offscreen 文档：只负责播放/停止后台送来的音频 */

interface AudioMessage {
  target?: string;
  type?: string;
  audioSrc?: string;
}

const player = new Audio();
player.preload = 'auto';

function stop(): void {
  player.pause();
  player.removeAttribute('src');
  player.load();
}

function play(audioSrc: string): void {
  stop();
  // 接口给的是裸 base64，需补上 data URI 前缀才能解码
  player.src = audioSrc.startsWith('data:') ? audioSrc : `data:audio/mpeg;base64,${audioSrc}`;
  void player.play().catch(() => stop());
}

chrome.runtime.onMessage.addListener((message: AudioMessage) => {
  if (message.target !== 'offscreen') return false;

  if (message.type === 'playAudio' && message.audioSrc) play(message.audioSrc);
  if (message.type === 'pauseAudio') stop();

  return false;
});
