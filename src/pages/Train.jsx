import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getModel, updateModel } from '../services/db';
import { getEmbeddings, getEmbeddingCount, clearEmbeddings } from '../services/memoryStore';
import {
    computeMeanEmbedding,
    computeThreshold,
    euclideanDistance,
} from '../services/recognitionService';

/**
 * Train Page
 *
 * ══════════════════════════════════════════════════════════════════════
 *  Training Algorithm (Euclidean-distance, nearest-neighbor)
 * ══════════════════════════════════════════════════════════════════════
 *
 *  1. Collect all 128D descriptors (from session memory)
 *  2. Compute centroid (mean embedding) — raw average
 *  3. Compute threshold via leave-one-out nearest-neighbor:
 *       For each embedding eᵢ, find min distance to any eⱼ (j≠i)
 *       max_nn_dist = max of those min distances
 *       threshold = min(0.45, max_nn_dist × 1.25)
 *  4. Save to IndexedDB: meanEmbedding + ALL individual embeddings + threshold
 *
 *  During recognition: compare query to EACH stored embedding, take minimum.
 *  If min_distance < threshold → Recognized  (mirrors face-api.js FaceMatcher)
 *
 *  Why threshold ≤ 0.45, NOT 0.60:
 *    face-api.js FaceMatcher default 0.6 is for "anyone in a set".
 *    For "only THIS specific person" we need ≤0.45 to reject
 *    same-gender faces that still score ~0.5 against the mean.
 * ══════════════════════════════════════════════════════════════════════
 */
export default function Train() {
    const { modelId } = useParams();
    const navigate = useNavigate();
    const mid = parseInt(modelId, 10);

    const [model, setModel] = useState(null);
    const [embeddings, setEmbeddings] = useState([]);
    const [phase, setPhase] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [threshold, setThreshold] = useState(0.42);
    const [savedConfirm, setSavedConfirm] = useState(false);
    const logRef = useRef(null);

    const addLog = (msg, type = 'info') =>
        setLogs((prev) => {
            const next = [...prev.slice(-150), { msg, type, id: Date.now() + Math.random() }];
            requestAnimationFrame(() => {
                if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
            });
            return next;
        });

    useEffect(() => {
        (async () => {
            try {
                const m = await getModel(mid);
                if (!m) { navigate('/models'); return; }
                setModel(m);
                const inMem = getEmbeddings(mid);
                setEmbeddings(inMem);
                setThreshold(m.threshold || 0.42);
            } catch { navigate('/models'); }
        })();
    }, [mid]);

    const runTraining = async () => {
        if (embeddings.length < 1) return;
        setPhase('training');
        setProgress(0);
        setLogs([]);
        setSavedConfirm(false);

        try {
            addLog(`▶ Training "${model.name}"`, 'accent');
            addLog(`  ${embeddings.length} descriptors in session memory`, 'info');
            addLog(`  Metric: Euclidean distance (face-api.js native)`, 'info');
            addLog(`  Matcher: nearest-neighbor across all stored descriptors`, 'info');
            await tick(); setProgress(8);

            // ── Step 1: Extract raw 128D arrays from memory store ──
            const rawEmbs = embeddings.map((r) => Array.from(r.embedding));
            const dim = rawEmbs[0].length;
            addLog(`  Descriptor dim: ${dim}D`, 'info');
            await tick(); setProgress(18);

            // ── Step 2: Compute mean embedding (centroid) ──
            addLog('  Computing centroid (mean embedding)…', 'info');
            const meanEmb = computeMeanEmbedding(rawEmbs);
            addLog(`  Centroid: ${meanEmb.length}D vector`, 'success');
            await tick(); setProgress(30);

            // ── Step 3: Intra-class stats to distances ──
            addLog('  Computing intra-class Euclidean distances to centroid…', 'info');
            const distsToCentroid = rawEmbs.map((e) => euclideanDistance(e, meanEmb));
            const meanD = distsToCentroid.reduce((a, b) => a + b, 0) / distsToCentroid.length;
            const stdD = Math.sqrt(distsToCentroid.reduce((s, x) => s + (x - meanD) ** 2, 0) / distsToCentroid.length);
            const maxD = Math.max(...distsToCentroid);
            const minD = Math.min(...distsToCentroid);
            addLog(`  To centroid: mean=${meanD.toFixed(4)} std=${stdD.toFixed(4)}`, 'info');
            addLog(`  Range: [${minD.toFixed(4)}, ${maxD.toFixed(4)}]`, 'info');
            await tick(); setProgress(48);

            // ── Step 4: Compute threshold via leave-one-out NN distances ──
            addLog(`  Computing leave-one-out nearest-neighbor distances…`, 'info');
            addLog(`  (For each embedding, find its nearest sibling in training set)`, 'info');
            const { threshold: autoThr, maxNNDist } = computeThreshold(rawEmbs);
            addLog(`  Max NN distance (max intra-class spread): ${maxNNDist.toFixed(4)}`, 'info');
            addLog('', 'info');
            addLog(`  threshold = min(0.45, max_nn_dist × 1.25) = ${autoThr.toFixed(4)}`, 'accent');
            addLog(`  Recognition rule: min_dist < ${autoThr.toFixed(4)} → RECOGNIZED`, 'accent');
            setThreshold(autoThr);
            await tick(); setProgress(66);

            // ── Step 5: Self-validation ──
            addLog('  Self-validation (all training faces should pass)…', 'info');
            // Each embedding's nearest neighbor distance should be < threshold
            let passing = 0;
            for (let i = 0; i < rawEmbs.length; i++) {
                let minDist = Infinity;
                for (let j = 0; j < rawEmbs.length; j++) {
                    if (i === j) continue;
                    const d = euclideanDistance(rawEmbs[i], rawEmbs[j]);
                    if (d < minDist) minDist = d;
                }
                if (minDist < autoThr) passing++;
            }
            const pct = Math.round((passing / rawEmbs.length) * 100);
            addLog(`  Self-check: ${passing}/${rawEmbs.length} (${pct}%) pass threshold`, pct >= 90 ? 'success' : 'info');
            await tick(); setProgress(80);

            // ── Step 6: Persist to IndexedDB ──
            addLog('  Saving to IndexedDB…', 'info');
            addLog('  → meanEmbedding (128D centroid)', 'info');
            addLog(`  → allEmbeddings (${rawEmbs.length}×128D for NN matching)`, 'info');
            addLog('  → threshold, trainedAt', 'info');
            await updateModel(mid, {
                trained: true,
                meanEmbedding: Array.from(meanEmb),
                allEmbeddings: rawEmbs,                // CRITICAL for NN matching
                threshold: autoThr,
                trainedAt: Date.now(),
                imageCount: rawEmbs.length,
            });
            await tick(); setProgress(92);

            // ── Step 7: Verify DB write ──
            const verify = await getModel(mid);
            if (!verify.trained || !verify.allEmbeddings || verify.allEmbeddings.length === 0) {
                throw new Error('DB write verification failed — allEmbeddings missing after save');
            }
            addLog(`  ✓ Verified: ${verify.allEmbeddings.length} embeddings stored, threshold=${verify.threshold.toFixed(4)}`, 'success');
            setProgress(100);

            setStats({
                count: rawEmbs.length,
                dim,
                meanDist: meanD.toFixed(4),
                stdDist: stdD.toFixed(4),
                maxNNDist: maxNNDist.toFixed(4),
                threshold: autoThr,
                passing,
                pct,
            });
            setModel(verify);

            addLog('', 'info');
            addLog(`✅ Training complete! "${model.name}" ready for testing.`, 'success');
            addLog(`   Nearest-neighbor matching active.`, 'success');
            setPhase('done');
            setSavedConfirm(true);

            // Clear individual embeddings from memoryStore (now persisted in IndexedDB)
            clearEmbeddings(mid);

        } catch (err) {
            addLog(`✕ Training failed: ${err.message}`, 'error');
            console.error('[Train] error:', err);
            setPhase('error');
        }
    };

    const saveThreshold = async () => {
        try {
            const v = await getModel(mid);
            await updateModel(mid, { ...v, threshold });
            setSavedConfirm(true);
            addLog(`  Threshold updated to ${threshold.toFixed(4)}`, 'accent');
        } catch (e) {
            addLog('Failed to save: ' + e.message, 'error');
        }
    };

    const pendingCount = embeddings.length;
    const alreadyTrained = model?.trained && model?.meanEmbedding?.length > 0;
    const hasNoData = pendingCount === 0;

    return (
        <main className="page">
            <div className="container">

                {/* Header */}
                <div className="page-header animate-fade-up">
                    <div className="badge">Step 3 of 4</div>
                    <h1>Train Model</h1>
                    <p>
                        Train face recognition for{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>{model?.name || '…'}</strong>.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

                    {/* Left panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {phase === 'idle' && (
                            <div className="card animate-fade-up">

                                {alreadyTrained && (
                                    <div style={{
                                        background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
                                        borderRadius: 8, padding: '12px 16px', marginBottom: 18,
                                        fontSize: '0.83rem', color: 'var(--success)',
                                    }}>
                                        ✓ Already trained — threshold {model.threshold?.toFixed(4)}.
                                        {model.allEmbeddings?.length > 0 &&
                                            ` ${model.allEmbeddings.length} embeddings stored for NN matching.`}
                                    </div>
                                )}

                                {hasNoData && !alreadyTrained && (
                                    <div style={{
                                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                                        borderRadius: 8, padding: '14px 16px', marginBottom: 18,
                                        fontSize: '0.85rem', color: 'var(--warning)',
                                    }}>
                                        ⚠ No embeddings in session memory.
                                        Upload and process images first — embeddings reset on page refresh.
                                    </div>
                                )}

                                {hasNoData && alreadyTrained && (
                                    <div style={{
                                        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
                                        borderRadius: 8, padding: '14px 16px', marginBottom: 18,
                                        fontSize: '0.85rem', color: 'var(--accent-light)',
                                    }}>
                                        ℹ Already trained with nearest-neighbor matching. Upload new images to re-train with a different dataset.
                                    </div>
                                )}

                                <h3 style={{ marginBottom: 16 }}>
                                    {alreadyTrained ? 'Re-train Model' : 'Ready to Train'}
                                </h3>

                                <div className="stats-row" style={{ marginBottom: 20 }}>
                                    <StatCard label="In Memory" value={pendingCount} />
                                    <StatCard label="Stored NN" value={model?.allEmbeddings?.length ?? '—'} />
                                    <StatCard label="Status" value={alreadyTrained ? '✓ Trained' : 'Untrained'} accent={alreadyTrained} />
                                </div>

                                {!hasNoData && pendingCount < 5 && (
                                    <div style={{
                                        background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)',
                                        borderRadius: 8, padding: '12px 16px', marginBottom: 18,
                                        fontSize: '0.84rem', color: 'var(--danger)',
                                    }}>
                                        ⚠ Recommend ≥ 10 images for reliable recognition. Upload more.
                                    </div>
                                )}

                                {/* Algorithm steps */}
                                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Nearest-Neighbor Training Pipeline
                                </p>
                                {[
                                    'Collect 128D face descriptors from session memory',
                                    'Compute centroid (raw mean of all descriptors)',
                                    'Leave-one-out NN: find each embedding\'s nearest sibling',
                                    'threshold = min(0.45, max_nn_dist × 1.25)',
                                    'Save centroid + ALL individual descriptors to IndexedDB',
                                    'Recognition: min(dist to each embedding) < threshold → Recognized',
                                ].map((s, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 7, alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                            background: 'var(--accent-dim)', border: '1px solid rgba(99,102,241,0.25)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-light)',
                                        }}>{i + 1}</div>
                                        <span style={{ fontSize: '0.81rem', color: 'var(--text-secondary)', paddingTop: 2 }}>{s}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {(phase === 'training' || phase === 'done' || phase === 'error') && (
                            <div className="card animate-fade-up">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <h3>Training Progress</h3>
                                    {phase === 'training' && <span className="spinner" />}
                                    {phase === 'done' && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Complete</span>}
                                    {phase === 'error' && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>✕ Failed</span>}
                                </div>
                                <div className="progress-wrap" style={{ marginBottom: 6 }}>
                                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 14, textAlign: 'right' }}>{progress}%</div>
                                <div className="log-terminal" ref={logRef} style={{ maxHeight: 290 }}>
                                    {logs.map((l) => (
                                        <div key={l.id} className={`log-line ${l.type}`}>{l.msg}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {phase === 'done' && stats && (
                            <div className="card animate-fade-up">
                                <h3 style={{ marginBottom: 16 }}>Training Report</h3>
                                <div className="stats-row" style={{ marginBottom: 16 }}>
                                    <StatCard label="Samples" value={stats.count} />
                                    <StatCard label="Max NN Dist" value={stats.maxNNDist} />
                                    <StatCard label="Mean→Centroid" value={stats.meanDist} />
                                    <StatCard label="Std" value={stats.stdDist} />
                                    <StatCard label="Self-Test" value={`${stats.pct}%`} accent={stats.pct >= 90} />
                                    <StatCard label="Threshold" value={stats.threshold.toFixed(4)} accent />
                                </div>
                                <div style={{
                                    padding: '12px 16px', borderRadius: 8,
                                    background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                                    fontSize: '0.78rem', lineHeight: 2,
                                }}>
                                    <code style={{ color: 'var(--accent-light)' }}>
                                        threshold = min(0.45, {stats.maxNNDist} × 1.25) = {stats.threshold.toFixed(4)}
                                    </code>
                                    <br />
                                    During inference: compare query to all {stats.count} stored descriptors, take minimum distance.
                                    <br />
                                    <strong style={{ color: 'var(--success)' }}>min_dist &lt; {stats.threshold.toFixed(4)} → RECOGNIZED</strong>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        <div className="card animate-fade-up" style={{ animationDelay: '80ms' }}>
                            <h4 style={{ marginBottom: 4 }}>Threshold (Euclidean)</h4>
                            <p style={{ fontSize: '0.75rem', marginBottom: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                                Auto-computed. Cap: <strong>0.45</strong> for individual recognition
                                (stricter than FaceMatcher's 0.60 default).
                            </p>
                            <div style={{ textAlign: 'center', marginBottom: 10 }}>
                                <span style={{
                                    fontSize: '2.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                                    color: threshold <= 0.45 ? 'var(--success)' : 'var(--warning)',
                                }}>
                                    {threshold.toFixed(3)}
                                </span>
                            </div>
                            <input
                                type="range" className="frego-slider"
                                min={0.28} max={0.55} step={0.005}
                                value={threshold}
                                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6, marginBottom: 12 }}>
                                <span>Strict (0.28)</span>
                                <span>Loose (0.55)</span>
                            </div>
                            {threshold > 0.50 && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--warning)', marginBottom: 10 }}>
                                    ⚠ Above 0.50 — risk of same-gender false positives
                                </div>
                            )}
                            {(phase === 'done' || alreadyTrained) && (
                                <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={saveThreshold}>
                                    Save Threshold
                                </button>
                            )}
                            {savedConfirm && (
                                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--success)', marginTop: 8 }}>
                                    ✓ Saved
                                </div>
                            )}
                        </div>

                        {/* Metric card */}
                        <div className="card animate-fade-up" style={{ animationDelay: '100ms', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 2 }}>
                            <h4 style={{ marginBottom: 10, color: 'var(--text-primary)' }}>Recognition Logic</h4>
                            <code style={{ color: 'var(--accent-light)', fontSize: '0.71rem', display: 'block', marginBottom: 6 }}>
                                dist = √Σ(query[i] − ref[i])²
                            </code>
                            <div>For each stored descriptor:</div>
                            <div>· compute dist to query</div>
                            <div>· track minimum</div>
                            <div style={{ marginTop: 6, marginBottom: 6, fontWeight: 700, color: 'var(--text-primary)' }}>
                                if min_dist &lt; threshold → ✓
                            </div>
                            <div style={{ padding: '8px 10px', background: 'var(--bg-panel)', borderRadius: 6, fontSize: '0.73rem' }}>
                                Why NN beats mean:
                                <br />
                                Mean-only → fails for same gender.
                                NN → compares to each training frame individually.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {phase === 'idle' && (
                        <button className="btn btn-primary btn-lg" onClick={runTraining} disabled={pendingCount < 1}>
                            {alreadyTrained ? '↺ Re-Train' : 'Start Training →'}
                        </button>
                    )}
                    {phase === 'training' && (
                        <button className="btn btn-ghost btn-lg" disabled>
                            <span className="spinner" /> Training…
                        </button>
                    )}
                    {phase === 'done' && (
                        <>
                            <button className="btn btn-success btn-lg" onClick={() => navigate('/test')}>
                                Test Live →
                            </button>
                            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/download')}>
                                Download Model
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setPhase('idle'); setProgress(0); setLogs([]); }}>
                                Re-Train
                            </button>
                        </>
                    )}
                    {phase === 'error' && (
                        <button className="btn btn-ghost" onClick={() => { setPhase('idle'); setProgress(0); }}>
                            Retry
                        </button>
                    )}
                </div>

            </div>
        </main>
    );
}

function tick() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function StatCard({ label, value, accent }) {
    return (
        <div className="stat-card">
            <div className="stat-value" style={accent ? { color: 'var(--success)' } : {}}>{value ?? '—'}</div>
            <div className="stat-label">{label}</div>
        </div>
    );
}
