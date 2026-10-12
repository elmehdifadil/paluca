# Déployer PALUCA sur Cloudflare Workers

Cette configuration publie les pages Vite et le serveur Express ensemble.
Les données sont conservées dans SQLite (Durable Object `PalucaStore`) ; les fichiers envoyés sont conservés dans R2 (`paluca-uploads`).
Le développement Node existant reste disponible avec `npm run dev`.

## Première publication

Depuis le dossier du projet, avec Node.js 22 ou plus récent :

```sh
npm ci
npx wrangler login
npx wrangler r2 bucket create paluca-uploads
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put MISTRAL_API_KEY
npm run deploy:cloudflare
```

Les clés IA sont facultatives pour afficher le site. Saisir les nouvelles clés dans les invites Wrangler, jamais dans le dépôt GitHub.
La création du bucket nécessite que R2 soit activé dans le compte Cloudflare.
La commande de déploiement crée le Durable Object et son schéma SQLite.
Wrangler affiche ensuite l'adresse `https://paluca.<sous-domaine>.workers.dev`.

## Publication automatique depuis GitHub

Dans Cloudflare, créer un projet **Workers** et connecter `elmehdifadil/paluca`, branche `main`.

- Répertoire racine : racine du dépôt.
- Commande de compilation : `npm run build:cloudflare`.
- Commande de déploiement : `npx wrangler deploy`.
- Nom du Worker : `paluca`.

Créer le bucket `paluca-uploads` avant la première compilation distante.
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
L'émulation locale conserve SQLite et les fichiers R2 dans `.wrangler/state`.

## Données existantes

La première publication démarre avec les valeurs par défaut définies dans l'application.
L'ancien fichier `data/store.json` et les anciens uploads ne sont pas transférés automatiquement.
Ne pas publier un export contenant des données personnelles dans GitHub. Effectuer un import privé et contrôlé après configuration des accès.
Les routes `/api/data` conservent leur comportement existant ; l'adaptation ne crée pas un système d'authentification.

Le stockage JSON dans une seule ligne SQLite conserve le format existant et ordonne les requêtes pour éviter les pertes lors des mises à jour simultanées.
Cette architecture convient à une première migration ; une forte charge nécessitera de répartir les tables et les traitements IA.

Documentation : https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
