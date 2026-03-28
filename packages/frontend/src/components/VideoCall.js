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

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function VideoCall({ socket, callState, onEnd }) {
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);

  const [status,     setStatus]     = useState(callState.mode); // incoming|outgoing|ringing|connecting|active|rejected|error
  const [mutedAudio, setMutedAudio] = useState(false);
  const [mutedVideo, setMutedVideo] = useState(false);
  const [errorMsg,   setErrorMsg]   = useState('');

  // ── Create RTCPeerConnection ───────────────────────────────────────────────
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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
  }, [socket, callState.peerId]); // eslint-disable-line

  // ── Get local camera + mic ─────────────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

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
        socket.emit('call:offer', { to: callState.peerId, offer });
        setStatus('ringing');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.name === 'NotAllowedError'
            ? 'Camera/mic permission denied'
            : `Could not start call: ${err.message}`);
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line — only run on mount

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
        ? 'Camera/mic permission denied'
        : `Could not answer: ${err.message}`);
      setStatus('error');
    }
  }, [callState, createPC, getLocalStream, socket]);

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
    incoming:   '📞 Incoming call…',
    outgoing:   '📡 Starting call…',
    ringing:    '🔔 Ringing…',
    connecting: '🔄 Connecting…',
    active:     '🟢 Connected',
    rejected:   '❌ Call declined',
    error:      '⚠️ Error',
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
            <div className="vc-incoming-name">{callState.peerUsername} wil videobellen…</div>
            <div className="vc-incoming-btns">
              <button className="btn vc-accept-btn" onClick={answerCall}>📞 Opnemen</button>
              <button className="btn vc-reject-btn" onClick={rejectCall}>🔴 Weigeren</button>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="vc-error">
            <div style={{ fontSize: '1.8rem' }}>⚠️</div>
            <div>{errorMsg}</div>
            <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={onEnd}>
              Sluiten
            </button>
          </div>
        )}

        {/* Rejected */}
        {status === 'rejected' && (
          <div className="vc-error">
            <div style={{ fontSize: '1.8rem' }}>📵</div>
            <div>{callState.peerUsername} neemt niet op.</div>
          </div>
        )}

        {/* Video feeds (outgoing / connecting / active) */}
        {!['incoming', 'error', 'rejected'].includes(status) && (
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
        )}

        {/* Controls (shown when not purely incoming / error) */}
        {!['incoming', 'error', 'rejected'].includes(status) && (
          <div className="vc-controls">
            <button
              className={`vc-ctrl${mutedAudio ? ' vc-ctrl--muted' : ''}`}
              onClick={toggleAudio}
              title={mutedAudio ? 'Mic aan' : 'Mic uit'}
            >
              {mutedAudio ? '🔇' : '🎤'}
            </button>
            <button
              className={`vc-ctrl${mutedVideo ? ' vc-ctrl--muted' : ''}`}
              onClick={toggleVideo}
              title={mutedVideo ? 'Camera aan' : 'Camera uit'}
            >
              {mutedVideo ? '📵' : '📷'}
            </button>
            <button className="vc-ctrl vc-ctrl--end" onClick={safeEnd} title="Gesprek beëindigen">
              📴 Beëindigen
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default VideoCall;
