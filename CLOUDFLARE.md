# Déployer PALUCA sur Cloudflare Workers

Cette configuration publie les pages Vite et le serveur Express ensemble.
Les données sont conservées dans SQLite (Durable Object `PalucaStore`) ; les fichiers envoyés sont conservés dans des tables SQLite, par blocs de 512 Kio. Aucun abonnement R2 n’est nécessaire.
Le développement Node existant reste disponible avec `npm run dev`.

## Première publication

Depuis le dossier du projet, avec Node.js 22 ou plus récent :

```sh
npm ci
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put CONSEILLER_PASSWORD
npx wrangler secret put UNIVERSITE_PASSWORD
npm run deploy:cloudflare
```

Les clés IA sont facultatives pour afficher le site. Saisir les nouvelles clés dans les invites Wrangler, jamais dans le dépôt GitHub.
Conserver le forfait Workers Free. Les Durable Objects SQLite sont disponibles dans ce forfait ; les quotas gratuits restent applicables.
La commande de déploiement crée le Durable Object et son schéma SQLite.
Wrangler affiche ensuite l'adresse `https://paluca.<sous-domaine>.workers.dev`.

## Publication automatique depuis GitHub

Dans Cloudflare, créer un projet **Workers** et connecter `elmehdifadil/paluca`, branche `main`.

- Répertoire racine : racine du dépôt.
- Commande de compilation : `npm run build:cloudflare`.
- Commande de déploiement : `npx wrangler deploy`.
- Nom du Worker : `paluca`.

Configurer les secrets `GEMINI_API_KEY` et `MISTRAL_API_KEY` dans les paramètres du Worker, puis redéployer.

## Vérifier localement

```sh
npm run lint
npm run check:cloudflare
npm run dev:cloudflare
```

Pendant que l'émulateur est ouvert, exécuter `node scripts/test-cloudflare.mjs` dans un autre terminal.
Ce test écrit uniquement dans l'émulateur local : routes HTML, API, mises à jour simultanées et uploads image/document.

Tester `/`, `/espace`, `/connexion`, `/inscription`, `/admin` et `/api/health`.
L'émulation locale conserve SQLite et les fichiers dans `.wrangler/state`.

## Données existantes

La première publication démarre avec les catalogues publics de la version récente du dossier `Documents/ChatGPT/paluca`, intégrés dans `cloudflare/public-seed.json`.
Les comptes candidats, rendez-vous, inscriptions et sessions ne sont jamais inclus dans ce fichier publié.
La remise à zéro des lauréats effectuée dans la version récente est conservée ; les comptes supprimés ne sont pas réintroduits depuis l'ancienne archive.
L'ancien fichier `data/store.json` et les anciens uploads ne sont pas transférés automatiquement.
Ne pas publier un export contenant des données personnelles dans GitHub. Effectuer un import privé et contrôlé après configuration des accès.
Les routes `/api/data` conservent leur comportement existant ; l'adaptation ne crée pas un système d'authentification.
Le système de connexion et les droits conseiller/université/lauréat de la version récente sont conservés. Configurer les trois mots de passe de personnel dans les secrets Cloudflare avant l'utilisation publique.

Le stockage JSON dans une seule ligne SQLite conserve le format existant et ordonne les requêtes pour éviter les pertes lors des mises à jour simultanées.
Cette architecture convient à une première migration ; une forte charge nécessitera de répartir les tables et les traitements IA.

Documentation : https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/

## Limites sans R2

Chaque fichier est limité à 10 Mio. Le stockage total par Durable Object sur le forfait gratuit est limité à 1 Go. Les limites quotidiennes de requêtes et d’opérations SQLite s’appliquent aussi. Cette solution convient à un petit site ; elle ne remplace pas un service de stockage de gros fichiers à forte charge.

Tarification : https://developers.cloudflare.com/durable-objects/platform/pricing/
Limites : https://developers.cloudflare.com/durable-objects/platform/limits/
