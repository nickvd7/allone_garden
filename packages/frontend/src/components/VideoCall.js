/**
 * VideoCall — WebRTC proximity video call component.
 *
 * Rendered as a floating overlay by App.js whenever `callState` is set.
 *
 * callState shape:
 *   { mode: 'incoming' | 'outgoing', peerId, peerUsername, offer? }
 *
 * Signals via Socket.IO:
 *   Outgoing: call:offer → call:answer ← call:ice-candidate ↔
 *   Incoming: call:answer → call:ice-candidate ↔
 *   Both:     call:end / call:reject to tear down
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const BASE = process.env.REACT_APP_API_URL || '';

// Default fallback ICE servers (Google STUN, public / no credentials).
// The real list is fetched from /api/world/ice-servers on mount so that the
// server operator can add TURN credentials without rebuilding the frontend.
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Module-level cache so every concurrent VideoCall instance shares the same
// fetched config within the same page load.
let iceServersCache = null;
async function fetchIceServers() {
  if (iceServersCache) return iceServersCache;
  try {
    const res = await fetch(`${BASE}/api/world/ice-servers`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.iceServers) && data.iceServers.length) {
        iceServersCache = data.iceServers;
        return iceServersCache;
      }
    }
  } catch { /* fall through to default */ }
  iceServersCache = DEFAULT_ICE_SERVERS;
  return iceServersCache;
}

// Detect WebRTC support at module load time (avoids repeated checks)
const WEBRTC_SUPPORTED =
  typeof RTCPeerConnection !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

/**
 * Fallback shown when the browser doesn't support WebRTC.
 * Old iOS Safari (< 14.5), some Android webviews, and Electron lite builds
 * all lack full WebRTC support.
 */
function WebRTCUnsupported({ peerUsername, onEnd, socket, peerId }) {
  const { t } = useTranslation();
  // Notify the remote peer that the call cannot proceed
  React.useEffect(() => {
    socket.emit('call:reject', { to: peerId });
  }, [socket, peerId]);

  return (
    <div className="vc-overlay">
      <div className="vc-card">
        <div className="vc-header">
          <span className="vc-peer-name">📹 {peerUsername}</span>
        </div>
        <div className="vc-error">
          <div style={{ fontSize: '2rem' }}>📵</div>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
            {t('videoCall.unsupported_title')}
          </div>
          <div style={{ fontSize: '0.88rem', color: '#888', marginBottom: '0.75rem' }}>
            {t('videoCall.unsupported_body')}
          </div>
          <button className="btn btn-secondary" onClick={onEnd}>{t('videoCall.close')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public wrapper — swaps in the fallback component when WebRTC is unavailable
 * so that hooks in VideoCallInner are always called unconditionally.
 *
 * _webrtcSupported: optional override for testing (defaults to module constant).
 */
function VideoCall({ socket, callState, onEnd, _webrtcSupported = WEBRTC_SUPPORTED }) {
  if (!_webrtcSupported) {
    return (
      <WebRTCUnsupported
        peerUsername={callState.peerUsername}
        peerId={callState.peerId}
        socket={socket}
        onEnd={onEnd}
      />
    );
  }
  return <VideoCallInner socket={socket} callState={callState} onEnd={onEnd} />;
}

function VideoCallInner({ socket, callState, onEnd }) {
  const { t } = useTranslation();
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);
  const audioOnly      = callState.audioOnly || false;

  const [status,     setStatus]     = useState(callState.mode); // incoming|outgoing|ringing|connecting|active|rejected|error
  const [mutedAudio, setMutedAudio] = useState(false);
  const [mutedVideo, setMutedVideo] = useState(false);
  const [errorMsg,   setErrorMsg]   = useState('');

  // ICE servers fetched from backend (includes TURN if configured server-side)
  const [iceServers, setIceServers] = useState(DEFAULT_ICE_SERVERS);
  useEffect(() => {
    fetchIceServers().then(setIceServers).catch(() => {});
  }, []);

  // ── Create RTCPeerConnection ───────────────────────────────────────────────
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('call:ice-candidate', { to: callState.peerId, candidate });
      }
    };

    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current && streams[0]) {
        remoteVideoRef.current.srcObject = streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected')    setStatus('active');
      if (s === 'disconnected' || s === 'failed') safeEnd();
    };

    pcRef.current = pc;
    return pc;
  }, [socket, callState.peerId, iceServers]); // eslint-disable-line

  // ── Get local camera + mic (or audio only) ────────────────────────────────
  const getLocalStream = useCallback(async () => {
    const audioOnly = callState.audioOnly || false;
    const stream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
    localStreamRef.current = stream;
    if (!audioOnly && localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, [callState.audioOnly]);

  // ── Tear down everything ───────────────────────────────────────────────────
  const safeEnd = useCallback(() => {
    socket.emit('call:end', { to: callState.peerId });
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current        = null;
    localStreamRef.current = null;
    onEnd();
  }, [socket, callState.peerId, onEnd]);

  const rejectCall = useCallback(() => {
    socket.emit('call:reject', { to: callState.peerId });
    onEnd();
  }, [socket, callState.peerId, onEnd]);

  // ── Start outgoing call ────────────────────────────────────────────────────
  useEffect(() => {
    if (callState.mode !== 'outgoing') return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await getLocalStream();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const pc = createPC();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { to: callState.peerId, offer, audioOnly: callState.audioOnly || false });
        setStatus('ringing');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.name === 'NotAllowedError'
            ? t('videoCall.err_permission')
            : t('videoCall.err_start', { msg: err.message }));
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only run on mount

  // ── Answer incoming call ───────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    try {
      setStatus('connecting');
      const stream = await getLocalStream();
      const pc     = createPC();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('call:answer', { to: callState.peerId, answer });
    } catch (err) {
      setErrorMsg(err.name === 'NotAllowedError'
        ? t('videoCall.err_permission')
        : t('videoCall.err_answer', { msg: err.message }));
      setStatus('error');
    }
  }, [callState, createPC, getLocalStream, socket, t]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const onAnswer = async ({ answer }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
        setStatus('connecting');
      } catch (e) {
        console.error('[VideoCall] setRemoteDescription failed', e);
      }
    };

    const onIce = async ({ candidate }) => {
      try {
        if (pcRef.current && candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        // Non-fatal — ICE trickle sometimes produces harmless errors
      }
    };

    const onRemoteEnd    = () => { pcRef.current?.close(); localStreamRef.current?.getTracks().forEach((t) => t.stop()); onEnd(); };
    const onRemoteReject = () => { setStatus('rejected'); setTimeout(onEnd, 1800); };

    socket.on('call:answer',        onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:end',           onRemoteEnd);
    socket.on('call:reject',        onRemoteReject);

    return () => {
      socket.off('call:answer',        onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:end',           onRemoteEnd);
      socket.off('call:reject',        onRemoteReject);
    };
  }, [socket, onEnd]);

  // ── Mute toggles ──────────────────────────────────────────────────────────
  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMutedAudio(!track.enabled); }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setMutedVideo(!track.enabled); }
  };

  // ── Status label ──────────────────────────────────────────────────────────
  const statusLabel = {
    incoming:   t('videoCall.status_incoming'),
    outgoing:   t('videoCall.status_outgoing'),
    ringing:    t('videoCall.status_ringing'),
    connecting: t('videoCall.status_connecting'),
    active:     t('videoCall.status_active'),
    rejected:   t('videoCall.status_rejected'),
    error:      t('videoCall.status_error'),
  }[status] || '';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="vc-overlay">
      <div className="vc-card">

        {/* Header */}
        <div className="vc-header">
          <span className="vc-peer-name">📹 {callState.peerUsername}</span>
          <span className={`vc-status vc-status--${status}`}>{statusLabel}</span>
        </div>

        {/* Incoming: accept / reject */}
        {status === 'incoming' && (
          <div className="vc-incoming">
            <div className="vc-avatar">{callState.peerUsername?.[0]?.toUpperCase() ?? '?'}</div>
            <div className="vc-incoming-name">{t('videoCall.incoming_wants_video', { name: callState.peerUsername })}</div>
            <div className="vc-incoming-btns">
              <button className="btn vc-accept-btn" onClick={answerCall}>{t('videoCall.answer')}</button>
              <button className="btn vc-reject-btn" onClick={rejectCall}>{t('videoCall.decline')}</button>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="vc-error">
            <div style={{ fontSize: '1.8rem' }}>⚠️</div>
            <div>{errorMsg}</div>
            <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={onEnd}>
              {t('videoCall.close')}
            </button>
          </div>
        )}

        {/* Rejected */}
        {status === 'rejected' && (
          <div className="vc-error">
            <div style={{ fontSize: '1.8rem' }}>📵</div>
            <div>{t('videoCall.peer_not_answering', { name: callState.peerUsername })}</div>
          </div>
        )}

        {/* Video feeds (outgoing / connecting / active) */}
        {!['incoming', 'error', 'rejected'].includes(status) && (
          audioOnly ? (
            <div className="vc-audio-only">
              <div style={{ fontSize: '3.5rem', animation: status === 'active' ? 'pulse 1.5s infinite' : undefined }}>
                {status === 'active' ? '🎙️' : status === 'ringing' ? '🔔' : '⏳'}
              </div>
              <div style={{ fontWeight: 600, marginTop: '0.5rem' }}>
                {status === 'active' ? `In gesprek met ${callState.peerUsername}` : statusLabel}
              </div>
            </div>
          ) : (
            <div className="vc-videos">
              {/* Remote (main) */}
              <video
                ref={remoteVideoRef}
                className="vc-remote"
                autoPlay
                playsInline
              />
              {status !== 'active' && (
                <div className="vc-waiting-overlay">
                  <span style={{ fontSize: '2.5rem', animation: 'pulse 1.5s infinite' }}>
                    {status === 'ringing' ? '🔔' : '⏳'}
                  </span>
                  <span>{statusLabel}</span>
                </div>
              )}
              {/* Local (picture-in-picture) */}
              <video
                ref={localVideoRef}
                className="vc-local"
                autoPlay
                playsInline
                muted
              />
            </div>
          )
        )}

        {/* Controls (shown when not purely incoming / error) */}
        {!['incoming', 'error', 'rejected'].includes(status) && (
          <div className="vc-controls">
            <button
              className={`vc-ctrl${mutedAudio ? ' vc-ctrl--muted' : ''}`}
              onClick={toggleAudio}
              title={mutedAudio ? t('videoCall.mic_unmute') : t('videoCall.mic_mute')}
            >
              {mutedAudio ? '🔇' : '🎤'}
            </button>
            {!audioOnly && (
              <button
                className={`vc-ctrl${mutedVideo ? ' vc-ctrl--muted' : ''}`}
                onClick={toggleVideo}
                title={mutedVideo ? t('videoCall.cam_on') : t('videoCall.cam_off')}
              >
                {mutedVideo ? '📵' : '📷'}
              </button>
            )}
            <button className="vc-ctrl vc-ctrl--end" onClick={safeEnd} title={t('videoCall.end_call_title')}>
              {t('videoCall.end_call')}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default VideoCall;
