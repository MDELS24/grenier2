import React, { useEffect, useState, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, Mail, LogOut } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { allowedEmail, supabase } from '@/lib/supabase';
const Home = lazy(() => import('./page'));
import './globals.css';
/** Gère la session Supabase et affiche la connexion ou l’inventaire privé. */
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(!supabase),
    [email, setEmail] = useState(allowedEmail),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(''),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has('error')) {
      setError('Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.');
      history.replaceState(null, '', location.pathname);
    }
    // Écoute aussi les changements de session déclenchés depuis un autre onglet.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, value) => {
      if (active) {
        setSession(value);
        setReady(true);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          if (error) setError('Connexion expirée. Demandez un nouveau lien.');
          setSession(data.session);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError('Impossible de vérifier la connexion. Réessayez.');
          setReady(true);
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  /** Envoie un lien à un compte existant ; le serveur conserve le contrôle d’accès. */
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setSent(false);
    if (email.trim().toLowerCase() !== allowedEmail) {
      setError('Cette adresse n’est pas autorisée pour ce grenier.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href,
        },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(60);
    } catch {
      setError('Le lien n’a pas pu être envoyé. Vérifiez l’adresse ou réessayez dans une minute.');
    } finally {
      setBusy(false);
    }
  }
  /** Déconnecte cet appareil sans interrompre les sessions des autres appareils. */
  async function logout() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setError('Déconnexion impossible. Réessayez.');
    else {
      setSession(null);
      setSent(false);
      setError('');
    }
    setBusy(false);
  }
  if (!ready)
    return (
      <main className="auth-page">
        <p role="status">Vérification de votre connexion…</p>
      </main>
    );
  if (session && session.user.email?.toLowerCase() === allowedEmail)
    return (
      <>
        <div className="account-bar">
          <span>{session.user.email}</span>
          <button onClick={logout} disabled={busy}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Suspense
          fallback={
            <main>
              <p role="status">Chargement de votre inventaire…</p>
            </main>
          }
        >
          <Home key={session.user.id} />
        </Suspense>
      </>
    );
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <Archive size={23} />
          </span>
          grenier2<span className="brand-dot">.</span>
        </a>
        <span className="auth-icon">
          <Mail size={28} />
        </span>
        <h1>Retrouvez votre grenier.</h1>
        <p>Connectez-vous avec un lien reçu par e-mail, sans mot de passe.</p>
        {!supabase ? (
          <p className="error" role="alert">
            La connexion est en cours de configuration. Revenez bientôt.
          </p>
        ) : session ? (
          <>
            <p role="alert" className="error">
              Ce compte n’a pas accès à ce grenier.
            </p>
            <button className="secondary" onClick={logout} disabled={busy}>
              Changer de compte
            </button>
          </>
        ) : (
          <form onSubmit={login}>
            <label htmlFor="email">
              Adresse e-mail
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {sent && (
              <p role="status" className="login-success">
                Consultez votre boîte mail et cliquez sur le lien de connexion. Pensez aussi aux
                courriers indésirables.
              </p>
            )}
            <button className="primary" disabled={busy || cooldown > 0}>
              {busy
                ? 'Envoi en cours…'
                : cooldown
                  ? `Renvoyer dans ${cooldown} s`
                  : sent
                    ? 'Renvoyer le lien'
                    : 'Recevoir mon lien de connexion'}
            </button>
          </form>
        )}
        <p className="auth-note">Vos caisses et leurs emplacements, sur tous vos appareils.</p>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
