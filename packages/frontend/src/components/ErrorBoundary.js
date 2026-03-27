/**
 * ErrorBoundary — catches unhandled React render errors and shows a
 * friendly fallback instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh',
        background: '#f1f8e9', fontFamily: 'sans-serif', padding: '32px',
      }}>
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '40px',
          maxWidth: '480px', width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🌱</div>
          <h1 style={{ color: '#388e3c', marginTop: 0 }}>Something went wrong</h1>
          <p style={{ color: '#555', marginBottom: '24px' }}>
            An unexpected error occurred in the garden. Your progress has been auto-saved.
          </p>
          {this.state.error && (
            <pre style={{
              background: '#f5f5f5', borderRadius: '8px', padding: '12px',
              fontSize: '12px', color: '#c62828', textAlign: 'left',
              overflowX: 'auto', marginBottom: '24px',
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#388e3c', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '12px 24px', fontSize: '16px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload garden
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
