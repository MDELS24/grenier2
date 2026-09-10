# Grenier2

Copie indépendante de Grenier, avec la même interface d’inventaire et les déplacements temporaires. Interface React statique sur GitHub Pages, PostgreSQL et connexion par lien e-mail avec Supabase.

Le projet Grenier d’origine et sa base Cloudflare restent indépendants. Aucune donnée réelle d’inventaire n’est incluse dans ce dépôt.

## Configuration Supabase

1. Utiliser un nouveau projet Supabase. Exécuter `supabase/migrations/202609100001_grenier2.sql` dans son SQL Editor, une seule fois.
2. Dans Authentication > Users, créer l’utilisateur `lienmathieu2@gmail.com` (e-mail confirmé). Désactiver les nouvelles inscriptions dans les paramètres Auth. L’application utilise `shouldCreateUser: false`.
3. Activer Email et configurer l’envoi des e-mails. Le service e-mail de test Supabase limite les destinataires autorisés ; configurer un SMTP pour un envoi normal si nécessaire.
4. Dans URL Configuration, définir Site URL et Redirect URLs : `https://mdels24.github.io/grenier2/`. Ajouter `http://127.0.0.1:5173/grenier2/` pour les tests locaux.
5. Conserver le modèle Magic Link avec `{{ .ConfirmationURL }}`. Le lien reçu ouvre l’application et établit la session.

La table utilise RLS (propriétaire et adresse autorisée). Les écritures passent par une fonction PostgreSQL qui vérifie l’identité et verrouille la caisse avant de comparer sa révision. Les accès anonymes et les écritures directes sont refusés. Ne jamais mettre une clé service_role ou secrète dans le frontend.

## Fichiers du projet

`source.zip` contient l’arborescence complète du projet. Le workflow GitHub Actions extrait cette archive avant les tests et la compilation. Pour développer, décompresser l’archive dans un dossier vide.

## Développement

Node.js >=22.13.0.

```sh
npm ci
cp .env.example .env.local
# Renseigner URL Supabase et clé publique publishable / anon.
npm run dev
npm test
npm run build
```

Les tests exécutent la migration sur PostgreSQL embarqué (PGlite), avec des identités simulées : aller-retour, prolongation, déplacement vers un autre rangement, conflit de révision, restrictions par utilisateur et refus des accès anonymes. Ils ne remplacent pas le test d’e-mail réel Supabase.

## GitHub Pages

Dans Settings > Secrets and variables > Actions > Variables, définir :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Ces valeurs sont publiques et intégrées au JavaScript. Dans Settings > Pages, choisir GitHub Actions comme source. Le workflow `.github/workflows/pages.yml` teste, compile et déploie la branche `main`. Le build refuse une configuration manquante.

Adresse prévue : https://mdels24.github.io/grenier2/

Documentation : [Supabase Magic Link](https://supabase.com/docs/guides/auth/auth-email-passwordless), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
