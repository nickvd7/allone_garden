/**
 * Tests — VideoCall
 *
 * Covers:
 *  - Shows WebRTC unsupported fallback when RTCPeerConnection is unavailable
 *  - Incoming call: shows Accept / Reject buttons
 *  - Outgoing call: shows "Calling…" / End Call button
 *  - End Call emits call:end on socket and calls onEnd
 *  - Reject emits call:reject on socket and calls onEnd
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '../i18n/config';
import VideoCall from '../components/VideoCall';

function makeSocket() {
  return {
    on:   jest.fn(),
    off:  jest.fn(),
    emit: jest.fn(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const INCOMING_STATE = {
  mode:         'incoming',
  peerId:       99,
  peerUsername: 'Alice',
  offer:        { type: 'offer', sdp: 'fake' },
};

const OUTGOING_STATE = {
  mode:         'outgoing',
  peerId:       99,
  peerUsername: 'Alice',
};

// ── WebRTC unsupported ────────────────────────────────────────────────────────
describe('VideoCall — WebRTC unsupported', () => {
  let origRTCPeerConnection;

  beforeAll(() => {
    origRTCPeerConnection = global.RTCPeerConnection;
    delete global.RTCPeerConnection;
  });

  afterAll(() => {
    global.RTCPeerConnection = origRTCPeerConnection;
  });

  it('renders fallback message when WebRTC is unsupported', () => {
    render(
      <VideoCall socket={makeSocket()} callState={INCOMING_STATE} onEnd={() => {}} />
    );
    expect(screen.getByText(/WebRTC/i)).toBeInTheDocument();
  });

  it('shows peer username in the unsupported fallback', () => {
    render(
      <VideoCall socket={makeSocket()} callState={INCOMING_STATE} onEnd={() => {}} />
    );
    expect(screen.getByText(/Alice/i)).toBeInTheDocument();
  });

  it('fallback close button calls onEnd', () => {
    const onEnd = jest.fn();
    render(
      <VideoCall socket={makeSocket()} callState={INCOMING_STATE} onEnd={onEnd} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

// ── WebRTC supported ──────────────────────────────────────────────────────────
// We pass _webrtcSupported={true} as a test-only prop to bypass the module-level
// constant without needing jest.isolateModules (which breaks React's singleton).
describe('VideoCall — with WebRTC', () => {
  let mockPC;
  let mockStream;

  beforeEach(() => {
    // Minimal RTCPeerConnection mock
    mockPC = {
      connectionState: 'new',
      addTrack:              jest.fn(),
      createOffer:           jest.fn().mockResolvedValue({ type: 'offer', sdp: 'fake-sdp' }),
      createAnswer:          jest.fn().mockResolvedValue({ type: 'answer', sdp: 'fake-sdp' }),
      setLocalDescription:   jest.fn().mockResolvedValue(undefined),
      setRemoteDescription:  jest.fn().mockResolvedValue(undefined),
      addIceCandidate:       jest.fn().mockResolvedValue(undefined),
      close:                 jest.fn(),
    };
    global.RTCPeerConnection    = jest.fn(() => mockPC);
    global.RTCSessionDescription = jest.fn((d) => d);
    global.RTCIceCandidate       = jest.fn((c) => c);

    // Minimal MediaStream mock
    const fakeTrack = { stop: jest.fn(), enabled: true };
    mockStream = {
      getTracks:       jest.fn(() => [fakeTrack]),
      getAudioTracks:  jest.fn(() => [fakeTrack]),
      getVideoTracks:  jest.fn(() => [fakeTrack]),
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });
  });

  it('renders incoming call with Answer and Decline buttons', () => {
    render(
      <VideoCall socket={makeSocket()} callState={INCOMING_STATE} onEnd={() => {}} _webrtcSupported={true} />
    );
    expect(screen.getByRole('button', { name: /Answer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline/i })).toBeInTheDocument();
  });

  it('shows peer username for incoming call', () => {
    render(
      <VideoCall socket={makeSocket()} callState={INCOMING_STATE} onEnd={() => {}} _webrtcSupported={true} />
    );
    // Alice appears in both header and body — getAllByText confirms presence
    expect(screen.getAllByText(/Alice/i).length).toBeGreaterThanOrEqual(1);
  });

  it('emits call:reject and calls onEnd when Decline is clicked', () => {
    const socket = makeSocket();
    const onEnd  = jest.fn();
    render(
      <VideoCall socket={socket} callState={INCOMING_STATE} onEnd={onEnd} _webrtcSupported={true} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Decline/i }));
    expect(socket.emit).toHaveBeenCalledWith('call:reject', { to: 99 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('starts outgoing call: requests media and emits call:offer', async () => {
    const socket = makeSocket();
    render(
      <VideoCall socket={socket} callState={OUTGOING_STATE} onEnd={() => {}} _webrtcSupported={true} />
    );
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('call:offer', expect.objectContaining({ to: 99 }))
    );
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('emits call:end and calls onEnd when End is clicked', async () => {
    const socket = makeSocket();
    const onEnd  = jest.fn();
    render(
      <VideoCall socket={socket} callState={OUTGOING_STATE} onEnd={onEnd} _webrtcSupported={true} />
    );
    // Wait for outgoing setup to complete (offer sent) before clicking end
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('call:offer', expect.any(Object))
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^📴 End$/ }));
    });
    expect(socket.emit).toHaveBeenCalledWith('call:end', { to: 99 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
