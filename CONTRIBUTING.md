# Modifier Grenier2

Les fichiers sont directement à la racine du dépôt.

- `app/main.tsx` : session, connexion et déconnexion.
- `app/page.tsx` : inventaire, formulaires et déplacements.
- `app/globals.css` : présentation et responsive.
- `lib/crates.ts` : modèle et fonctions métier.
- `lib/api.ts` : accès à Supabase.
- `supabase/migrations/` : schéma, autorisations et opérations atomiques.
- `.github/workflows/pages.yml` : tests et publication de main.

## Conventions

TypeScript strict, indentation de deux espaces, formatage Prettier. Utiliser `npm run format` avant un commit et `npm run format:check` pour vérifier. Les fonctions métier et exports sont documentés avec JSDoc `/** … */`. Les commentaires internes `//` expliquent les invariants et choix non évidents. Les migrations utilisent des commentaires SQL `--`. Éviter les commentaires qui répètent le code.

Une migration déjà appliquée reste immuable : ajouter une nouvelle migration pour une évolution du schéma. Les composants de `components/ui/` proviennent de la bibliothèque UI ; conserver leurs conventions.

Avant publication : `npm test` et `npm run build`. Les changements de `main` sont publiés automatiquement. Ne pas ajouter de secrets dans le code ; utiliser uniquement la clé Supabase publique côté navigateur.
