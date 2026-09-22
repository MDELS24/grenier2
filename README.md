# Grenier2

Grenier2 est une application web conçue pour inventorier des caisses et retrouver facilement ce qu’elles contiennent. Elle permet de savoir où se trouve chaque caisse, même lorsqu’elle quitte temporairement sa place habituelle.

**[Ouvrir l’application](https://mdels24.github.io/grenier2/)**

## Ce que l’application permet de faire

- enregistrer une caisse, son contenu, sa catégorie et sa place habituelle ;
- choisir librement son numéro ou utiliser la numérotation proposée ;
- rechercher une caisse par son nom, son numéro, son contenu ou son emplacement ;
- filtrer et classer l’inventaire selon plusieurs critères ;
- déplacer temporairement une ou plusieurs caisses ;
- indiquer une date de retour et repérer les caisses à remettre en place ;
- gérer ses propres catégories ;
- importer ou exporter un inventaire au format CSV ;
- utiliser le format de l’application Itemlist ;
- choisir entre un affichage clair et sombre.

## Place habituelle et déplacement temporaire

Chaque caisse conserve une **place habituelle**. C’est l’endroit où elle doit normalement être rangée.

Lorsqu’une caisse est utilisée ailleurs, le déplacement temporaire indique son emplacement actuel sans effacer sa place habituelle. Par exemple, une caisse de matériel d’impression 3D peut rester une semaine dans le bureau, puis être remise au grenier en un clic.

Le tableau des caisses permet aussi de sélectionner plusieurs caisses pour les déplacer ensemble ou effectuer rapidement une opération de rangement.

## QR codes

Grenier2 peut produire des étiquettes QR à imprimer pour une caisse ou pour l’ensemble de l’inventaire. Un QR peut :

- ouvrir la fiche et afficher le contenu de la caisse ;
- ouvrir directement l’ajout de contenu ;
- afficher simplement le numéro de la caisse.

Les QR peuvent être lus avec la caméra d’un téléphone ou d’un ordinateur. Aucune photo du QR ni image provenant de la caméra n’est enregistrée.

## Sauvegarde et transfert

Le menu **Maintenance** regroupe les outils de sauvegarde :

- export complet au format Grenier2 ;
- export compatible avec les colonnes Itemlist ;
- import d’un fichier CSV avec aperçu avant validation.

Les doublons peuvent être ignorés lors d’un import afin de conserver les caisses déjà présentes.

## Accès et données

L’inventaire est accessible uniquement après connexion par e-mail. Les données des caisses sont conservées dans la base de données de l’application et ne sont pas incluses dans ce dépôt public.

Ce dépôt contient uniquement le code nécessaire au fonctionnement de Grenier2. Il ne contient ni inventaire personnel, ni session de connexion, ni clé privée.

## Projet

Grenier2 utilise React pour l’interface et Supabase pour l’authentification et le stockage des données. Le site est publié automatiquement avec GitHub Pages après vérification du code et des tests.

Les conventions utilisées pour modifier le projet sont décrites dans [CONTRIBUTING.md](CONTRIBUTING.md).
