import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_LINKS = [
    { to: '/models', label: 'Models' },
    { to: '/test', label: 'Test' },
    { to: '/download', label: 'Export' },
];

export default function Navbar() {
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                borderBottom: `1px solid ${scrolled ? 'var(--border-default)' : 'transparent'}`,
                background: scrolled ? 'rgba(4,4,12,0.85)' : 'transparent',
                backdropFilter: scrolled ? 'blur(20px)' : 'none',
                transition: 'all 300ms ease',
            }}
        >
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
                {/* Logo */}
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                    <div style={{
                        width: 32, height: 32,
                        borderRadius: 9,
                        background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.9rem',
                        fontWeight: 800,
                        color: 'white',
                        boxShadow: '0 0 20px var(--accent-glow)',
                        flexShrink: 0,
                    }}>F</div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                        Frego
                    </span>
                    <span style={{
                        fontSize: '0.65rem', fontWeight: 600,
                        background: 'var(--accent-dim)',
                        color: 'var(--accent-light)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        padding: '1px 7px', borderRadius: 999,
                        letterSpacing: '0.06em',
                    }}>BETA</span>
                </Link>

                {/* Nav links */}
                <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {NAV_LINKS.map((link) => {
                        const active = location.pathname === link.to;
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: 8,
                                    fontSize: '0.88rem',
                                    fontWeight: 500,
                                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    background: active ? 'var(--bg-elevated)' : 'transparent',
                                    textDecoration: 'none',
                                    transition: 'all 200ms ease',
                                    border: active ? '1px solid var(--border-default)' : '1px solid transparent',
                                }}
                            >
                                {link.label}
                            </Link>
                        );
                    })}

                    <Link to="/create" className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}>
                        + New Model
                    </Link>
                </nav>
            </div>
        </header>
    );
}
