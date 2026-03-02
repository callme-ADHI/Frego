import { useState, useEffect, useRef, useCallback } from 'react';
import { getAllModels, getModel } from '../services/db';
import { loadModels, detectFromVideo, areModelsLoaded } from '../services/faceService';
import { matchAgainstModel, TemporalSmoother } from '../services/recognitionService';

/**
 * Test Page — Real-time webcam inference.
 *
 * ══════════════════════════════════════════════════════════════════════
 *  Recognition Algorithm (Nearest-Neighbor Euclidean)
 * ══════════════════════════════════════════════════════════════════════
 *
 *  For each video frame:
 *    1. Detect face → 128D descriptor (faceRecognitionNet)
 *    2. For each stored training embedding:
 *         dist = euclidean_distance(query, training_emb)
 *    3. min_dist = minimum of all distances
 *    4. Temporal smoothing over 5 frames, 60% majority
 *    5. min_dist < threshold → RECOGNIZED (green)
 *       min_dist ≥ threshold → REJECTED   (red)
 *
 *  This is identical to face-api.js FaceMatcher.findBestMatch() behavior.
 * ══════════════════════════════════════════════════════════════════════
 */
export default function Test() {
    const [allModels, setAllModels] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [modelData, setModelData] = useState(null);
    const [camState, setCamState] = useState('idle');
    const [camError, setCamError] = useState('');
    const [mlLoading, setMlLoading] = useState(false);
    const [mlPct, setMlPct] = useState(0);
    const [fps, setFps] = useState(0);
    const [lastResult, setLastResult] = useState(null);
    const [threshold, setThreshold] = useState(0.42);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const inferring = useRef(false);
    const smootherRef = useRef(new TemporalSmoother());
    const fpsData = useRef({ frames: 0, last: performance.now() });

    const modelDataRef = useRef(null);
    const thresholdRef = useRef(0.42);

    useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
    useEffect(() => { modelDataRef.current = modelData; }, [modelData]);

    // Load trained models
    useEffect(() => {
        getAllModels().then((ms) => {
            const trained = ms.filter((m) => m.trained && m.meanEmbedding?.length > 0);
            setAllModels(trained);
            if (trained.length > 0) setSelectedId(trained[0].id);
        });
    }, []);

    // Load face-api ML weights
    useEffect(() => {
        if (areModelsLoaded()) return;
        setMlLoading(true);
        loadModels(({ pct }) => setMlPct(pct))
            .then(() => setMlLoading(false))
            .catch(() => setMlLoading(false));
    }, []);

    // Load selected model (including allEmbeddings from IndexedDB)
    useEffect(() => {
        if (!selectedId) return;
        (async () => {
            const m = await getModel(selectedId);
            const data = {
                meanEmbedding: m.meanEmbedding,
                allEmbeddings: m.allEmbeddings || [],  // ← NN matching data
                threshold: m.threshold ?? 0.42,
                name: m.name,
            };
            setModelData(data);
            modelDataRef.current = data;
            setThreshold(m.threshold ?? 0.42);
            thresholdRef.current = m.threshold ?? 0.42;
            smootherRef.current.reset();
        })();
    }, [selectedId]);

    const startCamera = async () => {
        setCamState('starting');
        setCamError('');
        smootherRef.current.reset();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            });
            streamRef.current = stream;
            const video = videoRef.current;
            video.srcObject = stream;
            await new Promise((res) => { video.onloadedmetadata = res; });
            await video.play();
            setCamState('running');
            startInferenceLoop();
        } catch (e) {
            setCamError(e.message);
            setCamState('error');
        }
    };

    const stopCamera = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        if (canvasRef.current) {
            canvasRef.current.getContext('2d')
                .clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        smootherRef.current.reset();
        setCamState('idle');
        setLastResult(null);
        setFps(0);
    }, []);

    useEffect(() => () => stopCamera(), []);

    const startInferenceLoop = () => {
        const loop = async (now) => {
            rafRef.current = requestAnimationFrame(loop);

            fpsData.current.frames++;
            const elapsed = now - fpsData.current.last;
            if (elapsed >= 1000) {
                setFps(Math.round((fpsData.current.frames * 1000) / elapsed));
                fpsData.current.frames = 0;
                fpsData.current.last = now;
            }

            if (inferring.current || !modelDataRef.current) return;
            inferring.current = true;

            try {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (!video || !canvas || video.readyState < 2) { inferring.current = false; return; }

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const detection = await detectFromVideo(video);

                if (detection) {
                    const md = modelDataRef.current;
                    const thr = thresholdRef.current;

                    // ── Nearest-neighbor match ──
                    const { distance, method } = matchAgainstModel(detection.descriptor, {
                        allEmbeddings: md.allEmbeddings,
                        meanEmbedding: md.meanEmbedding,
                        threshold: thr,
                    });

                    // ── Temporal smoothing ──
                    const smoothed = smootherRef.current.update(distance, md.name, thr);

                    setLastResult({
                        recognized: smoothed.recognized,
                        distance,
                        avgDist: smoothed.avgDist,
                        framesBelow: smoothed.framesBelow,
                        historyLength: smoothed.historyLength,
                        modelName: md.name,
                        threshold: thr,
                        method,
                        storedCount: md.allEmbeddings?.length ?? 0,
                    });

                    // ── Bounding box ──
                    const color = smoothed.recognized ? '#22c55e' : '#ef4444';
                    const { box } = detection;
                    const pad = 8;
                    const x = Math.max(0, box.x - pad);
                    const y = Math.max(0, box.y - pad);
                    const w = box.width + pad * 2;
                    const h = box.height + pad * 2;

                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2.5;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 16;
                    ctx.strokeRect(x, y, w, h);
                    ctx.shadowBlur = 0;

                    drawCorners(ctx, x, y, w, h, color);

                    // Label
                    const label = smoothed.recognized
                        ? `✓ ${md.name}  ${smoothed.avgDist.toFixed(3)}`
                        : `✕ Unknown  ${smoothed.avgDist.toFixed(3)}`;

                    ctx.font = 'bold 13px Inter, sans-serif';
                    const textW = ctx.measureText(label).width + 20;

                    ctx.fillStyle = color + 'e0';
                    ctx.beginPath();
                    ctx.roundRect(x, y - 34, textW, 28, 5);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.fillText(label, x + 10, y - 15);

                    // Distance bar: completely green when dist=0, empty at threshold
                    const ratio = Math.min(1, distance / thr); // 0 = perfect, 1 = at threshold
                    const barFill = Math.max(0, 1 - ratio);      // invert
                    ctx.fillStyle = color + '33';
                    ctx.fillRect(x, y + h + 4, w, 5);
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y + h + 4, w * barFill, 5);

                } else {
                    smootherRef.current.reset();
                    setLastResult(null);
                }
            } catch (_) { /* non-fatal */ }

            inferring.current = false;
        };
        rafRef.current = requestAnimationFrame(loop);
    };

    return (
        <main className="page">
            <div className="container">

                <div className="page-header animate-fade-up">
                    <div className="badge">Live Test</div>
                    <h1>Webcam Recognition</h1>
                    <p>Nearest-neighbor Euclidean matching against all stored training descriptors.</p>
                </div>

                {mlLoading && (
                    <div className="card animate-fade-up" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                            <span className="spinner" />
                            <span>Loading ML models ({mlPct}%)…</span>
                        </div>
                        <div className="progress-wrap">
                            <div className="progress-bar" style={{ width: `${mlPct}%` }} />
                        </div>
                    </div>
                )}

                {allModels.length === 0 && !mlLoading && (
                    <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <p style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                            ⚠ No trained models found. Complete Upload → Train steps first.
                        </p>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

                    {/* Webcam */}
                    <div>
                        <div className="webcam-wrap animate-fade-up">
                            <video ref={videoRef} playsInline muted style={{ display: 'block', width: '100%' }} />
                            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                            {camState !== 'running' && (
                                <div style={{
                                    position: 'absolute', inset: 0, minHeight: 320,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    justifyContent: 'center', background: 'var(--bg-panel)',
                                    gap: 14, color: 'var(--text-secondary)',
                                }}>
                                    <span style={{ fontSize: '3rem' }}>📷</span>
                                    {camState === 'idle' && <p>Camera not started</p>}
                                    {camState === 'starting' && <><span className="spinner" /><p>Starting…</p></>}
                                    {camState === 'error' && <p style={{ color: 'var(--danger)', textAlign: 'center', padding: '0 24px' }}>{camError}</p>}
                                </div>
                            )}
                            {camState === 'running' && <div className="fps-badge">{fps} fps</div>}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                            {camState !== 'running' ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={startCamera}
                                    disabled={mlLoading || !modelData || camState === 'starting'}
                                >
                                    {camState === 'starting' ? <><span className="spinner" /> Starting…</> : '▶ Start Camera'}
                                </button>
                            ) : (
                                <button className="btn btn-danger" onClick={stopCamera}>■ Stop Camera</button>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Model selector */}
                        <div className="card animate-fade-up" style={{ animationDelay: '80ms' }}>
                            <h4 style={{ marginBottom: 12 }}>Active Model</h4>
                            {allModels.length > 0 ? (
                                <select
                                    className="input"
                                    value={selectedId || ''}
                                    onChange={(e) => { setSelectedId(parseInt(e.target.value, 10)); smootherRef.current.reset(); }}
                                    style={{ marginBottom: 10 }}
                                >
                                    {allModels.map((m) => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <p style={{ fontSize: '0.83rem', color: 'var(--text-dim)' }}>No trained models</p>
                            )}
                            {modelData && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 2 }}>
                                    <div>Stored embeddings: <strong style={{ color: 'var(--text-secondary)' }}>{modelData.allEmbeddings?.length ?? 0}</strong></div>
                                    <div>Threshold: <strong style={{ color: 'var(--accent-light)', fontVariantNumeric: 'tabular-nums' }}>{modelData.threshold?.toFixed(4)}</strong></div>
                                    <div>Matcher: <strong style={{ color: 'var(--text-secondary)' }}>
                                        {modelData.allEmbeddings?.length > 0 ? 'Nearest-neighbor ✓' : 'Mean fallback ⚠'}
                                    </strong></div>
                                </div>
                            )}
                        </div>

                        {/* Threshold */}
                        <div className="card animate-fade-up" style={{ animationDelay: '100ms' }}>
                            <h4 style={{ marginBottom: 4 }}>Threshold</h4>
                            <p style={{ fontSize: '0.75rem', marginBottom: 10, color: 'var(--text-dim)' }}>
                                min_dist &lt; threshold → Recognized
                            </p>
                            <div style={{ textAlign: 'center', marginBottom: 10 }}>
                                <span style={{
                                    fontSize: '2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                    color: threshold <= 0.45 ? 'var(--success)' : 'var(--warning)',
                                }}>
                                    {threshold.toFixed(3)}
                                </span>
                            </div>
                            <input
                                type="range" className="frego-slider"
                                min={0.28} max={0.55} step={0.005}
                                value={threshold}
                                onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    setThreshold(v);
                                    thresholdRef.current = v;
                                    smootherRef.current.reset();
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
                                <span>Strict (0.28)</span>
                                <span>Loose (0.55)</span>
                            </div>
                            {threshold > 0.50 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: 6 }}>
                                    ⚠ Above 0.50 — high false positive risk
                                </div>
                            )}
                        </div>

                        {/* Live result */}
                        {camState === 'running' && (
                            <div className="card animate-fade-in" style={{
                                borderColor: lastResult
                                    ? lastResult.recognized ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'
                                    : 'var(--border-default)',
                                transition: 'border-color 200ms ease',
                            }}>
                                <h4 style={{ marginBottom: 12 }}>Live Result</h4>
                                {lastResult ? (
                                    <>
                                        <div style={{
                                            fontSize: '1.05rem', fontWeight: 700, marginBottom: 10,
                                            color: lastResult.recognized ? 'var(--success)' : 'var(--danger)',
                                        }}>
                                            {lastResult.recognized ? `✓ ${lastResult.modelName}` : '✕ Not Recognized'}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 2.1 }}>
                                            <div>
                                                Min dist:{' '}
                                                <strong style={{ color: lastResult.distance < lastResult.threshold ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {lastResult.distance.toFixed(4)}
                                                </strong>
                                            </div>
                                            <div>
                                                Avg dist (5f):{' '}
                                                <strong style={{ color: lastResult.avgDist < lastResult.threshold ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {lastResult.avgDist.toFixed(4)}
                                                </strong>
                                            </div>
                                            <div>
                                                Threshold:{' '}
                                                <strong style={{ color: 'var(--accent-light)' }}>{lastResult.threshold.toFixed(4)}</strong>
                                            </div>
                                            <div>
                                                Decision:{' '}
                                                <strong>{lastResult.avgDist.toFixed(4)} {lastResult.recognized ? '<' : '≥'} {lastResult.threshold.toFixed(4)}</strong>
                                            </div>
                                            <div>
                                                History:{' '}
                                                <strong style={{ color: 'var(--text-primary)' }}>
                                                    {lastResult.framesBelow}/{lastResult.historyLength} below
                                                </strong>
                                            </div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                                                vs {lastResult.storedCount} stored embeddings
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p style={{ fontSize: '0.83rem', color: 'var(--text-dim)' }}>No face detected</p>
                                )}
                            </div>
                        )}

                        {/* Legend */}
                        <div className="card animate-fade-up" style={{ animationDelay: '140ms', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            <h4 style={{ marginBottom: 10, color: 'var(--text-primary)' }}>How it works</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <div style={{ width: 22, height: 3, background: 'var(--success)', borderRadius: 2 }} />
                                <span>min_dist &lt; threshold</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ width: 22, height: 3, background: 'var(--danger)', borderRadius: 2 }} />
                                <span>min_dist ≥ threshold</span>
                            </div>
                            <div style={{ padding: '8px 10px', background: 'var(--bg-panel)', borderRadius: 6, lineHeight: 1.7 }}>
                                5-frame rolling window.
                                <br />
                                ≥60% frames must match.
                                <br />
                                NN compares to each stored descriptor.
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </main>
    );
}

function drawCorners(ctx, x, y, w, h, color) {
    const len = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    const corners = [
        [x, y, x + len, y, x, y + len],
        [x + w, y, x + w - len, y, x + w, y + len],
        [x, y + h, x + len, y + h, x, y + h - len],
        [x + w, y + h, x + w - len, y + h, x + w, y + h - len],
    ];
    for (const [ox, oy, ax, ay, bx, by] of corners) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ox, oy);
        ctx.lineTo(bx, by);
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}
