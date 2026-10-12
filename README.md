<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6cb12cbc-48ae-498a-b04b-f646f98508ac

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in [.env.local](.env.local) for CV structuring and visual analysis.
3. Set `MISTRAL_API_KEY` in the same file to enable OCR for scanned PDFs and images. Keep both keys in the deployment provider's secret settings in production; never add a real key to source control.
4. Run the app:
   `npm run dev`

## Configuration CV

Le serveur charge `.env.local`, puis `.env`. Les variables déjà définies par
l'hébergeur restent prioritaires. Renseignez `GEMINI_API_KEY` pour l'analyse IA
et/ou `MISTRAL_API_KEY` pour l'OCR et l'analyse Mistral, puis redémarrez le serveur.
Sans ces clés, les documents contenant du texte utilisent une extraction
simplifiée ; les scans et images nécessitent un service IA configuré.

Sur Vercel, ajoutez les clés dans les variables d'environnement du projet pour
l'environnement concerné, puis redéployez. `.env.local` n'est pas envoyé au
déploiement. Ne placez jamais de clé dans le HTML ou une variable `VITE_*`.

Une analyse échouée affiche maintenant l'erreur et ne modifie pas le profil.

## Parcours et données

La fiabilisation est enregistrée côté serveur et conditionne la réservation des
rendez-vous. Les comptes ayant déjà un accompagnement conservent leur parcours.
Le conseiller dispose d'une fiche à trois onglets, de recherches et d'un
historique protégé. Les anciens CV et diagnostics sont conservés.

Sur Vercel, les données sont chiffrées avant stockage dans Blob. Les révisions
sont immuables et les écritures concurrentes sont contrôlées par ETag. La clé
de chiffrement utilise la configuration existante ; ne pas remplacer le jeton
Blob ou ajouter une nouvelle clé de chiffrement sans migrer les données.

Tests locaux, sur données isolées :

```text
node --import tsx scripts/test-workflow.ts
node --import tsx scripts/test-browser.mjs
```
## Refonte du parcours — octobre 2026

La réservation initiale exige un questionnaire complet sauvegardé ; la
fiabilisation intervient avant l’accès aux prestations après l’entretien.
Les nouveaux comptes rendus doivent être enregistrés via le formulaire
« Enregistrer l’entretien ». Les seuils de prescription sont à configurer
dans le tableau de bord : aucune valeur arbitraire n’est activée.

Voir `RAPPORT-REFONTE.md` pour les changements, tests et limites constatées.
Tests supplémentaires : `scripts/test-prescription.ts` et
`scripts/test-cv-content.ts`.

## Aperçu du dossier et suppression des lauréats

L’aperçu back-office présente les quatre dimensions et les prestations suggérées
avec leurs justifications. Les scores sont recalculés à partir des réponses
complètes ; les données manquantes sont signalées. Le résultat d’extraction du
CV est conservé à l’inscription et lors du remplacement du CV.

L’opération de suppression administrative nécessite un plan récent, une session
administrateur et une sauvegarde chiffrée réussie. Elle vide les dossiers,
rendez-vous et inscriptions, révoque les sessions lauréats et libère les créneaux.
Les catalogues restent intacts. Les anciennes données du navigateur ne peuvent
plus réimporter les dossiers supprimés.

Tests dédiés : `scripts/test-advisor-preview.ts` et `scripts/test-laureat-reset.ts`.

## Stockage permanent des bannières et des profils

Les profils et les métadonnées des bannières sont conservés dans le stockage
Vercel Blob chiffré, avec contrôle des écritures concurrentes. Les images de
bannières importées sur Vercel sont enregistrées dans des objets Blob immuables,
sans écriture dans le disque temporaire d’une fonction. Un échec de stockage ne
produit pas de confirmation de sauvegarde.

Le back-office charge les collections du serveur. Il ne fusionne plus les
anciennes copies du navigateur dans une liste reçue du serveur. Les identifiants
de bannières supprimées empêchent leur réimportation par une copie ancienne.

Ne pas changer la clé de chiffrement ni remplacer le jeton utilisé pour la
chiffrer sans migration des données. Les sauvegardes chiffrées et les révisions
restent indépendantes des déploiements du code.

Tests dédiés : `scripts/test-permanent-storage.ts`,
`scripts/test-browser-banners.mjs`. Le contrôle de redéploiement utilise des
échantillons fictifs internes, sans créer de lauréat dans la liste opérationnelle.
