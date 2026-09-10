# Grenier2

Copie indépendante de Grenier, avec la même interface d’inventaire et les déplacements temporaires. Interface React statique sur GitHub Pages, PostgreSQL et connexion par lien e-mail avec Supabase.

Le projet Grenier d’origine et sa base Cloudflare restent indépendants. Aucune donnée réelle d’inventaire n’est incluse dans ce dépôt.

Application : https://mdels24.github.io/grenier2/

## Modifier le code

Les sources sont directement à la racine : `app/`, `lib/`, `components/`, `supabase/`, `tests/` et les fichiers de configuration. Aucune archive à extraire.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Renseigner les deux valeurs publiques Supabase dans `.env.local`. Les changements de `main` sont testés et publiés automatiquement sur GitHub Pages.

- [Guide de contribution et conventions de commentaires](CONTRIBUTING.md)
- [Configuration Supabase et déploiement](CONFIGURATION.md)

## Vérifications

```sh
npm run format:check
npm test
npm run build
```
