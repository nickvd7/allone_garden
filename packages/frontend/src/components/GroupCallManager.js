import React, { useState, useEffect, useRef, useCallback } from 'react';

// Manages mesh WebRTC connections for group calls.
// Each participant creates a PeerConnection to every other participant.
function GroupCallManager({ socket, currentUserId, currentUsername, participants, onLeave }) {
  const pcsRef = useRef({}); // { peerId: RTCPeerConnection }
  const localStreamRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: MediaStream }
  const [status, setStatus] = useState('connecting');
  const [mutedAudio, setMutedAudio] = useState(false);

  // Get local stream on mount
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
      })
      .catch(() => {
        navigator.mediaDevices?.getUserMedia({ audio: true })
          .then((stream) => { localStreamRef.current = stream; })
          .catch(() => {});
      });
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const createPcForPeer = useCallback((peerId) => {
    if (pcsRef.current[peerId]) return pcsRef.current[peerId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('group-call:ice', { to: peerId, candidate });
    };
    pc.ontrack = ({ streams }) => {
      if (streams[0]) {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: streams[0] }));
      }
    };
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pcsRef.current[peerId] = pc;
    return pc;
  }, [socket]);

  // Socket events for group call signaling
  useEffect(() => {
    const onPeerJoined = async ({ peerId }) => {
      const pc = createPcForPeer(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('group-call:offer', { to: peerId, offer });
    };
    const onOffer = async ({ from, offer }) => {
      const pc = createPcForPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('group-call:answer', { to: from, answer });
    };
    const onAnswer = async ({ from, answer }) => {
      await pcsRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer));
      setStatus('active');
    };
    const onIce = async ({ from, candidate }) => {
      try {
        await pcsRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch { /* non-fatal */ }
    };
    const onPeerLeft = ({ peerId }) => {
      pcsRef.current[peerId]?.close();
      delete pcsRef.current[peerId];
      setRemoteStreams((prev) => { const n = { ...prev }; delete n[peerId]; return n; });
    };

    socket.on('group-call:peer-joined', onPeerJoined);
    socket.on('group-call:offer', onOffer);
    socket.on('group-call:answer', onAnswer);
    socket.on('group-call:ice', onIce);
    socket.on('group-call:peer-left', onPeerLeft);
    return () => {
      socket.off('group-call:peer-joined', onPeerJoined);
      socket.off('group-call:offer', onOffer);
      socket.off('group-call:answer', onAnswer);
      socket.off('group-call:ice', onIce);
      socket.off('group-call:peer-left', onPeerLeft);
    };
  }, [socket, createPcForPeer]);

  const handleLeave = useCallback(() => {
    socket.emit('group-call:leave', {});
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    pcsRef.current = {};
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    onLeave();
  }, [socket, onLeave]);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMutedAudio(!track.enabled); }
  };

  return (
    <div className="vc-overlay">
      <div className="vc-card">
        <div className="vc-header">
          <span className="vc-peer-name">
            {'\u{1F465}'} Groepsgesprek ({Object.keys(remoteStreams).length + 1} deelnemers)
          </span>
          <span className={`vc-status vc-status--${status}`}>
            {status === 'active' ? '\u{1F7E2} Verbonden' : '\u{1F504} Verbinden…'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', padding: '0.5rem' }}>
          {Object.entries(remoteStreams).map(([peerId, stream]) => (
            <video
              key={peerId}
              autoPlay
              playsInline
              ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }}
              style={{ width: '100%', borderRadius: '8px', background: '#111' }}
            />
          ))}
        </div>
        <div className="vc-controls">
          <button
            className={`vc-ctrl${mutedAudio ? ' vc-ctrl--muted' : ''}`}
            onClick={toggleAudio}
          >
            {mutedAudio ? '\u{1F507}' : '\u{1F3A4}'}
          </button>
          <button className="vc-ctrl vc-ctrl--end" onClick={handleLeave}>
            {'\u{1F4F4}'} Verlaten
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupCallManager;
