// 微信录音器是全局资源：只注册一组原生回调，再分发给当前会话。
let recorder = null, active = null, stopping = null, serial = 0;
function update(session, patch) { if (!session.owner.disposed) session.owner.page.setData(patch); }
function clearTimer(session) { if (session && session.timer != null) { clearTimeout(session.timer); session.timer = null; } }
function release(session) { clearTimer(session); if (active === session) active = null; }
function fail(session, message) {
  release(session);
  update(session, { recording: false, voiceBusy: false, voiceState: 'error', voiceNotice: message });
}
function watchdog(session, ms, message) {
  clearTimer(session);
  session.timer = setTimeout(() => {
    if (active !== session) return;
    const wasRecording = ['starting', 'recording', 'stopping'].includes(session.state);
    fail(session, message);
    if (wasRecording) stopDevice(session);
  }, ms);
}
function stopDevice(session) {
  stopping = session;
  if (session.stopTimer != null) clearTimeout(session.stopTimer);
  session.stopTimer = setTimeout(() => {
    if (stopping !== session) return;
    stopping = null;
    update(session, { voiceNotice: '录音器停止超时，已解除等待，请重试；仍失败请退出App重进。', recording: false, voiceBusy: false });
  }, 5000);
  try { recorder.stop(); } catch (error) { if (stopping === session) stopping = null; clearTimeout(session.stopTimer); }
}
function getRecorder() {
  if (recorder || typeof platform.getRecorderManager !== 'function') return recorder;
  recorder = platform.getRecorderManager();
  if (typeof recorder.onStart === 'function') recorder.onStart(() => {
    const session = active;
    if (!session || session.state !== 'starting') return;
    session.state = 'recording';
    update(session, { recording: true, voiceBusy: false, voiceState: 'recording', voiceNotice: '正在录音，点击结束；最长60秒。' });
    watchdog(session, 65000, '录音结束回调超时，已恢复，可以重新录音。');
  });
  recorder.onError(error => {
    if (stopping) { clearTimeout(stopping.stopTimer); stopping = null; }
    if (active) fail(active, '录音失败：' + (error.errMsg || error.message || '请检查麦克风权限后重试'));
  });
  recorder.onStop(async result => {
    if (stopping) { clearTimeout(stopping.stopTimer); stopping = null; return; }
    const session = active;
    if (!session || !['starting', 'recording', 'stopping'].includes(session.state)) return;
    clearTimer(session);
    if (!result.tempFilePath || !(result.duration > 200)) return fail(session, '录音太短或没有生成音频，请重新录音，也可直接输入。');
    session.state = 'transcribing';
    update(session, { recording: false, voiceBusy: true, voiceState: 'transcribing', voiceNotice: '正在转成文字…超过等待时限会自动恢复。' });
    watchdog(session, 75000, '语音识别等待超时，已恢复。可重新录音或手动输入；原请求可能仍有费用，请以账单为准。');
    try {
      const text = await require('./model').transcribe(result.tempFilePath, result.duration / 1000);
      if (active !== session || session.owner.disposed) return;
      if (!String(text || '').trim()) return fail(session, '未识别到文字，请重新说或手动输入。');
      release(session);
      update(session, { recording: false, voiceBusy: false, voiceState: 'idle', voiceNotice: '已转成文字，可以修改后确认。' });
      try { session.owner.onText(text); }
      catch (error) { update(session,{voiceNotice:'语音已识别，但写入草稿失败：'+(error.message||'请检查本机存储后重试')}); }
    } catch (error) {
      if (active === session) fail(session, error.message || '语音识别失败，已恢复；原文字仍保留，可重试。');
    }
  });
  return recorder;
}
function create(page, onText) {
  const owner = { page, onText, disposed: false };
  const device = getRecorder();
  const say = message => { if (!owner.disposed) page.setData({ voiceNotice: message }); };
  const controller = {
    async toggle() {
      if (owner.disposed) return;
      if (!device) return say('当前环境不支持录音，请使用手机预览或手动输入。');
      if (stopping) return say('上一段录音正在停止，请稍候再点；超时会自动恢复。');
      if (active && active.owner === owner) {
        if (active.state === 'recording') {
          active.state = 'stopping';
          update(active, { recording: false, voiceBusy: true, voiceNotice: '正在结束录音…' });
          watchdog(active, 5000, '录音结束超时，已恢复，请重试。');
          try { device.stop(); } catch (error) { fail(active, '停止录音失败，请重试。'); }
          return;
        }
        return say(active.state === 'transcribing' ? '正在识别上一段语音，请稍候；超时会自动恢复。' : '录音器正在准备，请稍候。');
      }
      if (active) {
        active.owner.controller.cancel();
        if (stopping) return say('正在切换录音页面，请稍候再点一次。');
      }
      const session = { id: ++serial, owner, state: 'authorizing', timer: null };
      active = session;
      update(session, { recording: false, voiceBusy: true, voiceState: 'authorizing', voiceNotice: '正在申请麦克风权限…' });
      watchdog(session, 30000, '麦克风授权等待超时，请重新点击或检查录音权限。');
      try {
        await new Promise((resolve, reject) => platform.authorize({ scope: 'scope.record', success: resolve, fail: reject }));
        if (active !== session) return;
        session.state = 'starting';
        update(session, { voiceState: 'starting', voiceNotice: '正在启动录音…' });
        watchdog(session, 5000, '录音器没有响应，已恢复，请重新录音。');
        device.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
        // 某些测试/旧环境没有onStart；原生支持onStart时必须等实际启动回调。
        if (typeof device.onStart !== 'function' && active === session) {
          session.state = 'recording';
          update(session, { recording: true, voiceBusy: false, voiceState: 'recording', voiceNotice: '正在录音，点击结束；最长60秒。' });
          watchdog(session, 65000, '录音结束超时，请重试。');
        }
      } catch (error) {
        if (active === session) fail(session, '录音未启动：' + (error.errMsg || error.message || '请在录音权限中授权后重试'));
      }
    },
    cancel() {
      const session = active;
      if (session && session.owner === owner) {
        const needsStop = ['starting', 'recording', 'stopping'].includes(session.state);
        update(session,{voiceNotice:session.state==='transcribing'?'已取消等待，可以重新录音；上一请求可能已产生费用。':'已取消本次录音，未发送语音识别。'});
        release(session);
        if (needsStop) stopDevice(session);
      }
      if (!owner.disposed) page.setData({ recording: false, voiceBusy: false, voiceState: 'idle' });
    },
    dispose() { controller.cancel(); owner.disposed = true; }
  };
  owner.controller = controller;
  return controller;
}
function settings() { if (typeof platform.openSetting === 'function') platform.openSetting({}); }
module.exports = { create, settings };
