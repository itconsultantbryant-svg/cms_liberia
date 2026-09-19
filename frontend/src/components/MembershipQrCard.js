import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { assetUrl } from '../config/api';

/**
 * Membership QR with church logo centered (drawn on canvas in real time).
 */
const MembershipQrCard = ({ joinUrl, logoUrl, churchName, size = 280 }) => {
  const canvasRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!joinUrl || !canvasRef.current) return;
      setError('');
      try {
        const canvas = canvasRef.current;
        await QRCode.toCanvas(canvas, joinUrl, {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#1a2332', light: '#ffffff' }
        });
        if (cancelled) return;

        const logoSrc = assetUrl(logoUrl);
        if (!logoSrc) return;

        await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const ctx = canvas.getContext('2d');
              const logoBox = Math.round(size * 0.22);
              const pad = 6;
              const x = (size - logoBox) / 2;
              const y = (size - logoBox) / 2;
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              const r = 8;
              ctx.moveTo(x - pad + r, y - pad);
              ctx.arcTo(x - pad + logoBox + pad * 2, y - pad, x - pad + logoBox + pad * 2, y - pad + logoBox + pad * 2, r);
              ctx.arcTo(x - pad + logoBox + pad * 2, y - pad + logoBox + pad * 2, x - pad, y - pad + logoBox + pad * 2, r);
              ctx.arcTo(x - pad, y - pad + logoBox + pad * 2, x - pad, y - pad, r);
              ctx.arcTo(x - pad, y - pad, x - pad + logoBox + pad * 2, y - pad, r);
              ctx.closePath();
              ctx.fill();
              ctx.drawImage(img, x, y, logoBox, logoBox);
              resolve();
            } catch (e) {
              reject(e);
            }
          };
          img.onerror = () => resolve();
          img.src = logoSrc;
        });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not generate QR');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinUrl, logoUrl, size]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${(churchName || 'church').replace(/\s+/g, '-').toLowerCase()}-membership-qr.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  return (
    <div className="membership-qr-card">
      {error && <div className="error-message">{error}</div>}
      <canvas ref={canvasRef} width={size} height={size} aria-label="Membership QR code" />
      <p className="muted" style={{ fontSize: 13, wordBreak: 'break-all', marginTop: 8 }}>
        {joinUrl}
      </p>
      <div className="members-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
          Download QR
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigator.clipboard?.writeText(joinUrl)}
        >
          Copy link
        </button>
      </div>
    </div>
  );
};

export default MembershipQrCard;
