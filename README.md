# Grenier2

Copie indépendante de Grenier, avec la même interface d’inventaire et les déplacements temporaires. Interface React statique sur GitHub Pages, PostgreSQL et connexion par lien e-mail avec Supabase.

Le projet Grenier d’origine et sa base Cloudflare restent indépendants. Aucune donnée réelle d’inventaire n’est incluse dans ce dépôt.

Application : https://mdels24.github.io/grenier2/

## Vérifications

```sh
npm run format:check
npm test
npm run build
```

## Inventaires et personnalisation

Le bouton **Importer / exporter** accepte le CSV Grenier2 et détecte les 21 colonnes du CSV Itemlist. Un aperçu précède la confirmation. Les doublons sont ignorés par défaut, sans écraser les caisses existantes ; une erreur annule tout le lot.

Le CSV Itemlist fourni ne contient aucun lien entre objets, conteneurs et emplacements. Les conteneurs sont repris séparément, et les objets regroupés par lots dans des caisses « À classer ». Les métadonnées originales sont conservées pour le réexport. Les photos ne sont pas incluses dans ce format. L’export Itemlist utilise les mêmes colonnes ; la prise en charge de l’import par l’application iOS n’est pas garantie.

Le repère visible peut être entièrement modifié (60 caractères maximum, unique sans distinction de casse). L’identifiant interne reste stable. Sans repère saisi, une nouvelle caisse reçoit automatiquement un numéro de la forme G-000001.

Le bouton **Catégories** propose 18 catégories communes et permet d’ajouter des catégories personnelles. Supprimer une catégorie personnelle réaffecte ses caisses à **Autre**, après confirmation.

Pour une installation existante, appliquer dans l’ordre les migrations 202609150001 puis 202609150002, sans réexécuter la migration initiale.
